# app/services/normalize_service.py
"""Normalization pipeline: run normalize.R (or copy raw) then the round-0 SVD."""
import asyncio
import logging
import os
import shutil

from app.services.job_manager import transition_job, set_progress, JobPhase, JobStatusValue
from app.services.job_paths import JOBS_DIR
from app.services.samplesheet_parser import find_sample_sheet_name
from app.services.pipeline_outcome import progress_fields, handle_step_result, StepOutcome
from app.services.r_executor import run_r_script, NormalizationCommand, BatchInitCommand

logger = logging.getLogger(__name__)


async def run_normalization_pipeline(
    job_id: str,
    job_dir_id: str,
    method: str,
    cancel_event: asyncio.Event,
) -> None:
    """
    Orchestrates normalization + SVD plot (round 0).

    Started exclusively through pipeline_task.run_job_pipeline(). Do not create a
    cancel_event and do not unregister here; the transition to
    NORMALIZATION+RUNNING already happens in the route.
    """
    job_dir = str(JOBS_DIR / job_dir_id)

    # ── Step 1: normalization ─────────────────────────────────────────────────
    # _run_normalization_step reports explicitly whether this run succeeded,
    # instead of the caller inferring it from the global job status afterwards.
    # The latter was false-positive prone: a FAILED status originating from an
    # unrelated context (a race, a previous run) could wrongly skip the SVD step
    # even when step 1 had just completed successfully.
    step_succeeded = await _run_normalization_step(job_id, job_dir, method, cancel_event)

    if cancel_event.is_set():
        logger.info("Normalization cancelled after step 1: job_id=%s", job_id)
        return

    if not step_succeeded:
        # _run_normalization_step already set the matching FAILED transition —
        # just stop here, no further transition needed.
        return

    # ── Step 2: SVD plot, round 0 ─────────────────────────────────────────────
    await _run_svd_step(job_id, job_dir, cancel_event)


async def _run_normalization_step(
    job_id: str,
    job_dir: str,
    method: str,
    cancel_event: asyncio.Event,
) -> bool:
    """Run normalize.R, or copy the raw data when method == 'raw'.

    Returns True when the phase transitioned to NORMALIZATION+COMPLETED. Returns
    False on cancellation, timeout or failure — the matching transition (FAILED,
    or none on cancellation) has then already been set within this function.
    """
    if method == "raw":
        return await _copy_raw_data(job_id, job_dir)

    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            percent, message = progress_fields(data)
            set_progress(job_id, percent=percent, message=message)

    result = await run_r_script(
        command=NormalizationCommand(
            script="normalize.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            extra_args=[method],
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    if handle_step_result(
        job_id,
        result,
        phase=JobPhase.NORMALIZATION,
        fallback="normalize.R exited with an error.",
        timeout_step="Error: normalize.R exceeded its time limit.",
        timeout_detail="Normalization timeout.",
        failure_step="Error during normalization.",
        cancel_log=f"Normalization R script cancelled: job_id={job_id}",
    ) is not StepOutcome.SUCCESS:
        return False

    transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Normalization completed.",
    )
    return True


async def _copy_raw_data(job_id: str, job_dir: str) -> bool:
    """Provide raw data unchanged (method == 'raw'): copy filtered → normalized."""
    set_progress(job_id, percent=0, message="Copying the filtered raw data...")

    filtered   = os.path.join(job_dir, "filtered_data.rds")
    normalized = os.path.join(job_dir, "normalized_data.rds")

    if not os.path.exists(filtered):
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION,
            new_status=JobStatusValue.FAILED,
            current_step="Error: filtered_data.rds not found.",
            error={"detail": f"filtered_data.rds not found in {job_dir}"},
        )
        return False

    shutil.copyfile(filtered, normalized)
    set_progress(job_id, percent=100, message="Raw data provided.")

    transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Normalization completed.",
    )
    return True


async def _run_svd_step(
    job_id: str,
    job_dir: str,
    cancel_event: asyncio.Event,
) -> None:
    """Generate the round-0 SVD plot after a successful normalization."""
    transition_job(
        job_id,
        new_phase=JobPhase.SVD,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step="Starting SVD plot generation (round 0)...",
    )

    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            percent, message = progress_fields(data)
            set_progress(
                job_id,
                percent=percent,
                message=f"SVD (round 0): {message}",
            )

    try:
        sample_sheet_name = find_sample_sheet_name(job_dir)
    except Exception:
        sample_sheet_name = "SampleSheet.csv"

    result = await run_r_script(
        command=BatchInitCommand(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            beta_file="normalized_data.rds",
            sample_sheet_file=sample_sheet_name,
            plot_name="svd_plot_0.png",
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    if handle_step_result(
        job_id,
        result,
        phase=JobPhase.SVD,
        fallback="batch_svd.R exited with an error.",
        timeout_step="Error: batch_svd.R exceeded its time limit.",
        timeout_detail="SVD plot timeout.",
        failure_step="Error during SVD plot generation (round 0).",
        cancel_log=f"SVD plot cancelled: job_id={job_id}",
    ) is not StepOutcome.SUCCESS:
        return

    transition_job(
        job_id,
        new_phase=JobPhase.SVD,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="SVD plot (round 0) generated successfully.",
    )
    transition_job(
        job_id,
        new_phase=JobPhase.BATCH,
        new_status=JobStatusValue.WAITING,
        current_step="Ready for batch effect correction.",
    )
