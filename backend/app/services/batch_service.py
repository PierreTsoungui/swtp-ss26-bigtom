# app/services/batch_service.py
"""Batch-correction and downstream-analysis services, plus sample-sheet helpers."""
import asyncio
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path

from app.core.atomic_io import write_json_atomic, read_json_or_default
from app.core.config import DMR_CORES
from app.core.error_types import BatchException, ErrorTypes
from app.services.job_manager import transition_job, set_progress, JobPhase, JobStatusValue
from app.services.job_paths import JOBS_DIR, resolve_job_dir
# find_sample_sheet_name is re-exported here so existing importers
# (heatmap/normalize services, routes) keep resolving it from batch_service.
from app.services.samplesheet_parser import find_sample_sheet_name, read_data_section
from app.services.pipeline_outcome import (
    progress_fields,
    failure_detail,
    handle_step_result,
    StepOutcome,
)
from app.services.r_executor import (
    run_r_script,
    BatchCorrectionCommand,
    SvdPlotCommand,
    DmrAnalysisCommand,
    DmpAnalysisCommand,
    BetaExtractionCommand,
)

logger = logging.getLogger(__name__)


# ── Job directory ─────────────────────────────────────────────────────────────
# A thin, module-local wrapper around the shared resolver: the lookup/error
# logic lives once in job_paths, while the module-level JOBS_DIR stays patchable
# in tests.
def get_job_dir_or_404(job_id: str) -> Path:
    """Return the job's directory under ``JOBS_DIR`` or raise 404."""
    return resolve_job_dir(JOBS_DIR, job_id)


def next_correction_round(history: dict) -> int:
    """Round number for the next batch correction.

    Round numbering equals the SVD plot index (``svd_plot_<round>.png``):
    round 0 is the post-normalization baseline, round N the state after the
    N-th correction. Derived from the existing rounds rather than a stored
    counter, so it stays correct even if the history is edited or a counter
    drifts.
    """
    rounds = history.get("rounds", [])
    return max((r.get("round", 0) for r in rounds), default=0) + 1


def _build_initial_history(job_id: str) -> dict:
    """Baseline history for a fresh job (only the round-0 SVD, no correction yet).

    Round 0 is the baseline SVD produced by normalization (svd_plot_0.png),
    before any correction. The first correction is therefore round 1.
    """
    return {
        "job_id": job_id,
        "rounds": [
            {
                "round": 0,
                "type": "initial",
                "svd_plot": f"/api/v1/batch/{job_id}/svd-plot/0",
                "settings_used": None,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "current_round": 0,
        "correction_applied": False,
    }


def load_history(job_dir: Path, job_id: str) -> dict:
    """Load the batch history, tolerating a missing or corrupt file.

    A damaged ``batch_history.json`` (e.g. a crash mid-write) is treated as "no
    history": a fresh baseline is written atomically instead of surfacing a 500.
    """
    history_file = job_dir / "batch_history.json"
    if history_file.exists():
        history = read_json_or_default(history_file, None)
        if isinstance(history, dict):
            return history
        logger.warning(
            "batch_history.json is unreadable, rebuilding the baseline: job_id=%s", job_id
        )

    initial_history = _build_initial_history(job_id)
    save_history(job_dir, initial_history)
    return initial_history


def save_history(job_dir: Path, data: dict) -> None:
    """Persist the batch history atomically (temp file + os.replace)."""
    write_json_atomic(job_dir / "batch_history.json", data, indent=2)


def get_eligible_columns(job_dir: Path) -> list[dict]:
    """Columns usable as a batch variable OR a covariate, with their level count.

    Eligible = groups the samples: at least two distinct values and not one per
    sample (a per-sample identifier groups nothing). No technical/biological
    guess and no hardcoded column name — the biologist assigns the roles, helped
    by the sample-sheet preview. Returns ``[{"name", "levels"}]``.
    """
    headers, data_rows = read_data_section(job_dir)
    total = len(data_rows)
    if total == 0:
        return []

    eligible = []
    for i, header in enumerate(headers):
        values = sorted({row[i] for row in data_rows if row[i]})
        if 2 <= len(values) < total:
            eligible.append({"name": header, "levels": len(values), "values": values})
    return eligible


def validate_group_selection(job_dir: Path, group_column: str, case_group: str, control_group: str) -> None:
    """Validate a DMP/DMR group selection against the sample sheet.

    Permissive about *which* column is chosen (any grouping column), strict about
    consistency: the column must exist and both groups must be distinct values in
    it. Raises ``BatchException`` (RFC-9457) otherwise.
    """
    columns = {c["name"]: c for c in get_eligible_columns(job_dir)}
    col = columns.get(group_column)
    if col is None:
        raise BatchException(
            ErrorTypes.INVALID_BATCH_VARIABLE,
            detail=f"Comparison column '{group_column}' is not available.",
            provided=group_column,
            available=list(columns),
        )
    if case_group == control_group:
        raise BatchException(
            ErrorTypes.INVALID_SELECTION,
            detail="The case and control groups must be different.",
        )
    for role, value in (("case", case_group), ("control", control_group)):
        if value not in col["values"]:
            raise BatchException(
                ErrorTypes.INVALID_SELECTION,
                detail=f"The {role} group '{value}' does not occur in column '{group_column}'.",
                provided=value,
                available=col["values"],
            )


def get_available_columns_from_samplesheet(job_dir: Path) -> list:
    """Eligible grouping column names, without their level counts.

    Used by the batch route to validate that the selected batch variable and
    covariates refer to real, groupable sample-sheet columns.
    """
    return [col["name"] for col in get_eligible_columns(job_dir)]


def get_samplesheet_preview(job_dir: Path, max_rows: int = 50) -> dict:
    """Tabular preview of the sample sheet so the biologist can assign roles."""
    headers, data_rows = read_data_section(job_dir)
    limit = max(1, min(max_rows, 200))
    return {
        "columns": headers,
        "rows": data_rows[:limit],
        "total_rows": len(data_rows),
        "truncated": len(data_rows) > limit,
    }


# ── Pipeline-Tasks ────────────────────────────────────────────────────────────
# Each pipeline coroutine receives its cancel_event from the route's
# start_job_pipeline()/run_job_pipeline() wrapper. It must NOT create or
# register a cancel_event or wrap the task lifecycle itself
# (see r_executor_spec.md section 6, rule 3).

async def run_batch_pipeline_task(
    job_id: str,
    settings_dict: dict,
    next_round: int,
    job_dir: Path,
    cancel_event: asyncio.Event,
) -> None:
    """Run batch correction (batch_correct.R) followed by the SVD plot."""
    try:
        logger.info("Starting batch correction: job_id=%s", job_id)
        set_progress(job_id, percent=0, message="Initializing batch correction...")

        covariates_str = ",".join(settings_dict.get("covariates", []))

        async def on_batch_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = progress_fields(data)
                set_progress(job_id, percent=percent, message=message)

        correction_result = await run_r_script(
            command=BatchCorrectionCommand(
                script="batch_correct.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet="",
                extra_args=[settings_dict["batch_variable"], covariates_str],
            ),
            cancel_event=cancel_event,
            on_progress=on_batch_progress,
        )

        if handle_step_result(
            job_id,
            correction_result,
            phase=JobPhase.BATCH,
            fallback="batch_correct.R exited with an error.",
            timeout_step="Error: batch_correct.R exceeded its time limit.",
            timeout_detail="Batch correction timeout.",
            failure_step="Error during the mathematical batch correction.",
            cancel_log=f"Batch correction cancelled: job_id={job_id}",
        ) is not StepOutcome.SUCCESS:
            return

        # Batch correction done → open the SVD phase.
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Batch correction completed successfully.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.SVD,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step=f"Starting SVD plot generation (round {next_round})...",
        )

        # Generate the SVD plot.
        logger.info("Generating SVD plot: job_id=%s round=%s", job_id, next_round)

        async def on_svd_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = progress_fields(data)
                set_progress(
                    job_id,
                    percent=percent,
                    message=f"SVD (round {next_round}): {message}",
                )

        sample_sheet_name = find_sample_sheet_name(str(job_dir))

        plot_result = await run_r_script(
            command=SvdPlotCommand(
                script="batch_svd.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet="",
                beta_file="corrected_data.rds",
                sample_sheet_file=sample_sheet_name,
                plot_name=f"svd_plot_{next_round}.png",
            ),
            cancel_event=cancel_event,
            on_progress=on_svd_progress,
        )

        if handle_step_result(
            job_id,
            plot_result,
            phase=JobPhase.SVD,
            fallback="batch_svd.R exited with an error.",
            timeout_step="Error: batch_svd.R exceeded its time limit.",
            timeout_detail="SVD plot timeout.",
            failure_step="Error during SVD plot visualization.",
            cancel_log=f"SVD plot cancelled: job_id={job_id}",
        ) is not StepOutcome.SUCCESS:
            return

        # Update the batch history.
        logger.info("Updating batch history: job_id=%s", job_id)
        history_data = load_history(job_dir, job_id)
        history_data["rounds"].append({
            "round": next_round,
            "type": "correction",
            "svd_plot": f"/api/v1/batch/{job_id}/svd-plot/{next_round}",
            "settings_used": settings_dict,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        history_data["current_round"] = next_round
        history_data["correction_applied"] = True
        save_history(job_dir, history_data)

        # SVD done → reopen the batch phase for the next action.
        transition_job(
            job_id,
            new_phase=JobPhase.SVD,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="SVD plot generated successfully.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.WAITING,
            current_step="Batch correction finished. Waiting for the next action...",
        )
        logger.info("Batch workflow completed: job_id=%s", job_id)

    except Exception:
        logger.exception("Critical error in the batch pipeline task: job_id=%s", job_id)
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.FAILED,
            current_step="Critical system error.",
            error={"detail": "Internal batch pipeline crash."},
        )


async def run_downstream_analysis_task(
    job_id: str,
    job_dir_raw: str,
    cancel_event: asyncio.Event,
    *,
    array_type: str = "EPICv2",
    extract_from_normalized: bool = True,
    group_column: str = "",
    case_group: str = "",
    control_group: str = "",
) -> None:
    """Run DMR analysis followed by DMP analysis.

    The caller (batch route) owns the ANALYSIS+RUNNING transition.
    ``extract_from_normalized`` selects the beta source (True = uncorrected
    normalized data, False = batch-corrected matrix).

    ``group_column``/``case_group``/``control_group`` define the comparison
    (any column name, deterministic Δβ = mean(case) − mean(control), TAB-02).
    Both analyses keep ALL rows/regions (significance is a table filter, TAB-01).
    """
    group_args = [group_column, case_group, control_group]
    try:
        job_dir = Path(job_dir_raw).resolve()
        logger.info("Starting downstream analysis: job_id=%s", job_id)

        set_progress(job_id, percent=0, message="Starting the downstream analysis pipeline...")

        sample_sheet_name = find_sample_sheet_name(str(job_dir))

        # Bridge step: extract the beta matrix only when batch correction was skipped.
        if extract_from_normalized:
            logger.info("Batch skipped — extracting the uncorrected beta matrix: job_id=%s", job_id)
            set_progress(job_id, percent=2, message="Extracting the beta matrix from the normalized data...")

            extraction_result = await run_r_script(
                command=BetaExtractionCommand(
                    script="",
                    job_id=job_id,
                    job_dir=str(job_dir),
                    sample_sheet="",
                ),
                cancel_event=cancel_event,
                on_progress=None,
            )

            if extraction_result.is_cancelled:
                logger.info("Beta extraction cancelled: job_id=%s", job_id)
                return

            if not extraction_result.is_success:
                raise RuntimeError(
                    failure_detail(extraction_result, "Beta extraction failed.")
                )
        else:
            # corrected_data.rds is already a beta matrix (removeBatchEffect on
            # getBeta). DMR/DMP read beta.rds, so make the corrected matrix the
            # analysis input by copying it into place.
            logger.info("Using the batch-corrected data for the analysis: job_id=%s", job_id)
            set_progress(job_id, percent=5, message="Loading the corrected batch data...")
            corrected_path = job_dir / "corrected_data.rds"
            if not corrected_path.exists():
                raise RuntimeError(
                    f"corrected_data.rds not found in {job_dir} — batch correction "
                    "produced no data."
                )
            shutil.copyfile(corrected_path, job_dir / "beta.rds")

        # DMR analysis
        logger.info("Starting DMR analysis (dmr.R): job_id=%s", job_id)

        async def on_dmr_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = progress_fields(data)
                set_progress(
                    job_id,
                    percent=10 + int(percent * 0.45),
                    message=f"DMR: {message}",
                )

        dmr_result = await run_r_script(
            command=DmrAnalysisCommand(
                script="dmr.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet=sample_sheet_name,
                # Last arg is nCores: parallelize the DMR bootstraps (dmr.R caps
                # it at the host's physical cores). See app.core.config.DMR_CORES.
                # adjPvalDmr = 1.0 → keep all found regions (significance is a
                # table filter); nCores parallelizes bootstraps; then the group
                # selection (column, case, control) for a deterministic sign.
                extra_args=["beta.rds", "3", "NULL", "1.0", "1000", array_type, "10", str(DMR_CORES), *group_args],
            ),
            cancel_event=cancel_event,
            on_progress=on_dmr_progress,
        )

        if dmr_result.is_cancelled:
            logger.info("DMR analysis cancelled: job_id=%s", job_id)
            return

        if not dmr_result.is_success:
            raise RuntimeError(failure_detail(dmr_result, "The DMR script reported an error."))

        logger.info("DMR analysis succeeded: job_id=%s", job_id)

        # DMP analysis
        logger.info("Starting DMP analysis (dmp.R): job_id=%s", job_id)

        async def on_dmp_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = progress_fields(data)
                set_progress(
                    job_id,
                    percent=55 + int(percent * 0.43),
                    message=f"DMP: {message}",
                )

        dmp_result = await run_r_script(
            command=DmpAnalysisCommand(
                script="dmp.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet=sample_sheet_name,
                # adjPVal = 1.0 → keep ALL probes (significance is a table filter,
                # TAB-01); then arraytype + group selection (column, case, control).
                extra_args=["beta.rds", "1.0", array_type, *group_args],
            ),
            cancel_event=cancel_event,
            on_progress=on_dmp_progress,
        )

        if dmp_result.is_cancelled:
            logger.info("DMP analysis cancelled: job_id=%s", job_id)
            return

        if not dmp_result.is_success:
            raise RuntimeError(failure_detail(dmp_result, "The DMP script reported an error."))

        logger.info("DMP analysis succeeded: job_id=%s", job_id)

        # Analysis done → move to the results phase.
        transition_job(
            job_id,
            new_phase=JobPhase.ANALYSIS,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Downstream analysis finished successfully.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.RESULTS,
            new_status=JobStatusValue.WAITING,
        )
        logger.info("Downstream analysis completed: job_id=%s", job_id)

    except Exception as e:
        logger.exception("Error in the downstream analysis: job_id=%s", job_id)
        transition_job(
            job_id,
            new_phase=JobPhase.ANALYSIS,
            new_status=JobStatusValue.FAILED,
            current_step=f"Error in the analysis: {str(e)}",
            error={"detail": str(e)},
        )