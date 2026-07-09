# app/services/heatmap_service.py
"""Heatmap service: CpG selection, the heatmap.R pipeline, and grouping options."""

import asyncio
import json
import logging
import re
from collections import Counter
from pathlib import Path

import pandas as pd

from app.core.error_types import AppException, ErrorTypes
from app.models.heatmap import GroupingPayload
from app.services.job_manager import JobPhase, JobStatusValue, set_progress, transition_job
from app.services.job_paths import JOBS_DIR, resolve_job_dir
from app.services.r_executor import HeatmapCommand, run_r_script
from app.services.samplesheet_normalizer import BASENAME_COLUMN
from app.services.samplesheet_parser import columns_by_index, read_data_section
from app.services.table_filter import apply_filters

logger = logging.getLogger(__name__)

MAX_CPGS = 500
HEATMAP_FILENAME = "heatmap.png"
HEATMAP_INPUT_CSV = "heatmap_input.csv"  # filtered CpG IDs handed to R (single filter source)


# ── Helpers ───────────────────────────────────────────────────────────────────


def get_job_dir_or_404(job_id: str) -> Path:
    """Return the job's directory under ``JOBS_DIR`` or raise 404.

    A thin wrapper around the shared resolver: the lookup/error logic lives in
    ``job_paths`` while the module-level ``JOBS_DIR`` stays patchable in tests.
    """
    return resolve_job_dir(JOBS_DIR, job_id)


def _find_dmp_rds(job_dir: Path) -> Path:
    for candidate in ("dmp_results.rds", "dmp.rds"):
        p = job_dir / candidate
        if p.exists():
            return p

    matches = list(job_dir.glob("*dmp*.rds"))
    if matches:
        return matches[0]

    raise AppException(
        ErrorTypes.FILE_NOT_FOUND,
        detail=(
            f"No DMP result RDS file found in job '{job_dir.name}'. "
            "Expected 'dmp_results.rds' or a filename containing 'dmp'."
        ),
    )


def _build_r_env(grouping: GroupingPayload) -> dict:
    """Build the environment for heatmap.R.

    Filtering is NOT passed here anymore — the CpG selection is decided once in
    the backend (``prepare_heatmap_input``) and handed to R as
    ``heatmap_input.csv``. R only renders.
    """
    env: dict = {
        "HEATMAP_GROUP1": grouping.primary,
        "HEATMAP_MAX_ROWS": str(MAX_CPGS),
        "HEATMAP_OUTPUT": HEATMAP_FILENAME,
        "HEATMAP_INPUT": HEATMAP_INPUT_CSV,
    }
    if grouping.secondary:
        env["HEATMAP_GROUP2"] = grouping.secondary
    return env


def prepare_heatmap_input(job_id: str, job_dir: Path, filters: dict) -> int:
    """
    Single source of truth for *which* CpGs go into the heatmap.

    Applies the **same** filter layer as the DMP table view
    (``table_handler.build_dataframe`` → ``table_filter.apply_filters``) to
    ``dmp_results.csv``, enforces the 500-row cap, and writes the resulting CpG
    IDs to ``heatmap_input.csv`` for R. Raises a 400 (no rows / too many) before
    R is ever started.

    Returns the number of selected CpGs.
    """
    csv_path = job_dir / "dmp_results.csv"
    if not csv_path.exists():
        raise AppException(
            ErrorTypes.FILE_NOT_FOUND,
            detail="dmp_results.csv not found – run the DMP analysis before generating a heatmap.",
        )

    df = pd.read_csv(csv_path)
    df = apply_filters(df, "dmp", filters or {})  # SAME filter layer as the table view
    n = len(df)

    if n == 0:
        raise AppException(
            ErrorTypes.HEATMAP_NO_CPGS,
            detail="No CpGs match the current filter. Please relax the filter criteria.",
        )

    if n > MAX_CPGS:
        raise AppException(
            ErrorTypes.HEATMAP_TOO_MANY_CPGS,
            detail=(
                f"Heatmap is limited to {MAX_CPGS} CpGs; your current filter selects "
                f"{n}. Please tighten the filter (e.g. adjusted p-value or |Δβ|)."
            ),
        )

    id_col = "ID" if "ID" in df.columns else df.columns[0]
    out = df[[id_col]].rename(columns={id_col: "ID"})
    out.to_csv(job_dir / HEATMAP_INPUT_CSV, index=False)
    return n


# ── Async pipeline task ───────────────────────────────────────────────────────


async def run_heatmap_pipeline_task(
    job_id: str,
    job_dir: Path,
    dmp_rds: Path,
    sheet_name: str,
    grouping: GroupingPayload,
    cancel_event: asyncio.Event,
) -> None:
    """Run heatmap.R in the Docker container, streaming status via on_progress.

    Started exclusively through start_job_pipeline(), which:
      - creates and registers the cancel_event
      - registers the asyncio task (for deterministic /reset waiting)
      - handles unregister_cancel_event + unregister_job_task in its finally

    Therefore: do not create an own event and do not unregister manually here.
    The transition to HEATMAP+RUNNING already happens in the route.
    """
    set_progress(job_id, percent=0, message="Starting heatmap generation...")

    # ── Progress callback ──────────────────────────────────────────────────
    async def on_progress(data: dict):
        if not isinstance(data, dict):
            return
        if data.get("type") == "progress":
            step = int(data.get("step", 1))
            total = int(data.get("total_steps", 8))
            pct = 5 + int((step / total) * 90)
            set_progress(job_id, percent=pct, message=data.get("message", ""))

    # ── Invoke the R script ────────────────────────────────────────────────
    r_env = _build_r_env(grouping)

    result = await run_r_script(
        command=HeatmapCommand(
            script="heatmap.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sheet_name,
            result_rds_name=str(dmp_rds.name),
            sample_sheet_name=sheet_name,
            extra_env=r_env,
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    # ── Cancellation ───────────────────────────────────────────────────────
    if result.is_cancelled:
        logger.info("Heatmap generation cancelled: job_id=%s", job_id)
        return

    # ── Timeout ────────────────────────────────────────────────────────────
    if result.is_timeout:
        logger.error("Heatmap generation timed out: job_id=%s", job_id)
        transition_job(
            job_id,
            new_phase=JobPhase.HEATMAP,
            new_status=JobStatusValue.FAILED,
            current_step="Error: heatmap.R exceeded its time limit.",
            error={"detail": "Heatmap generation timeout."},
        )
        return

    # ── Failure (specialized: too many CpGs) ───────────────────────────────
    if not result.is_success:
        too_many = _parse_too_many_cpgs(result.stdout)

        error_payload = {
            "type": "https://api.bigtom.swtp/errors/heatmap-too-many-cpgs",
            "title": "Too many CpGs for heatmap",
            "status": 400,
            "detail": (
                f"At most {MAX_CPGS} allowed. "
                f"Found: {too_many if too_many else 'unknown count'}."
            ),
            "instance": f"/api/v1/heatmap/{job_id}",
        }

        transition_job(
            job_id,
            new_phase=JobPhase.HEATMAP,
            new_status=JobStatusValue.FAILED,
            current_step=str(error_payload["detail"]),
            error=error_payload,
        )
        return

    # ── Success ────────────────────────────────────────────────────────────
    transition_job(
        job_id,
        new_phase=JobPhase.HEATMAP,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Heatmap generated successfully.",
    )
    transition_job(
        job_id,
        new_phase=JobPhase.RESULTS,
        new_status=JobStatusValue.WAITING,
        current_step="Heatmap finished. Back to the results view.",
    )


# ── Helper: R-Output parsen ───────────────────────────────────────────────────


def _parse_too_many_cpgs(stdout: str) -> int | None:
    for line in stdout.splitlines():
        try:
            data = json.loads(line)
            if not isinstance(data, dict):
                continue

            log_type = data.get("type") or data.get("status")

            if log_type in ("failed", "error"):
                msg: str = data.get("message", "")
                if "Too many rows" in msg:
                    match = re.search(r"(\d+)\s+entries", msg)
                    if match:
                        return int(match.group(1))
                    match_any_digit = re.search(r"\d+", msg)
                    if match_any_digit:
                        return int(match_any_digit.group())
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def _parse_heatmap_metadata(stdout: str, job_dir: Path) -> dict:
    detected_cpgs = 0
    plotted_samples = 0

    for line in stdout.splitlines():
        try:
            data = json.loads(line)
            if not isinstance(data, dict):
                continue

            if data.get("status") == "running" and "Beta matrix ready" in data.get("message", ""):
                msg = data["message"]
                parts = msg.split()
                idx_rows = next((i for i, t in enumerate(parts) if t == "rows"), None)
                idx_cols = next((i for i, t in enumerate(parts) if t == "columns"), None)
                if idx_rows and parts[idx_rows - 1].isdigit():
                    detected_cpgs = int(parts[idx_rows - 1])
                if idx_cols and parts[idx_cols - 1].isdigit():
                    plotted_samples = int(parts[idx_cols - 1])
                break
        except (json.JSONDecodeError, ValueError):
            pass

    return {
        "detected_cpgs": detected_cpgs,
        "plotted_samples": plotted_samples,
        "message": "Heatmap generated successfully. The PNG can be retrieved.",
    }


def _read_samplesheet_columns(job_dir: Path) -> tuple[list[str], dict[int, list[str]], int]:
    """Return a column-oriented view of the sample sheet.

    The result is ``(headers, {col_index: [non-empty values]}, total_samples)``.
    A thin adapter over the shared :func:`samplesheet_parser.read_data_section`
    so both the strict grouping finder and the permissive annotation finder share
    exactly one parser.
    """
    headers, data_rows = read_data_section(job_dir)
    return headers, columns_by_index(headers, data_rows), len(data_rows)


def get_grouping_options_from_samplesheet(job_dir: Path) -> list:
    """Return columns usable for strict grouping (e.g. batch/comparison columns).

    A column qualifies only if it has ≥2 distinct values, every value occurs ≥2×,
    and the number of groups is ≤ 50 % of the samples.
    """
    try:
        headers, col_values, total_samples = _read_samplesheet_columns(job_dir)
        if total_samples == 0:
            return []

        eligible_columns = []
        for i, header in enumerate(headers):
            values = col_values[i]
            if not values:
                continue
            counter = Counter(values)
            unique_count = len(counter)
            if unique_count < 2:
                continue
            if any(count < 2 for count in counter.values()):
                continue
            if unique_count > (0.5 * total_samples):
                continue
            eligible_columns.append(header)

        return eligible_columns

    except Exception as e:
        raise AppException(
            ErrorTypes.INVALID_CSV_CONTENT,
            detail=f"The SampleSheet could not be analyzed for the heatmap: {e}",
        ) from e


def _classify_column(values: list[str], n_distinct: int, total_samples: int) -> str:
    """Categorical | continuous | identifier — a hint for the annotation UI/plot."""
    is_numeric = bool(values) and all(_is_number(v) for v in values)
    # A numeric column with many distinct values is continuous (e.g. "age"),
    # even when every value is unique — check this before the identifier rule.
    if is_numeric and n_distinct > 10:
        return "continuous"
    if total_samples > 1 and n_distinct >= total_samples:
        return "identifier"
    return "categorical"


def _is_number(value: str) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def find_annotation_columns(job_dir: Path) -> list[dict]:
    """Return every sample-sheet column offered as a heatmap annotation.

    Permissive by design: returns **every** column that has at least one
    non-empty value, with a type hint (categorical / continuous / identifier) and
    the distinct count.

    Unlike :func:`get_grouping_options_from_samplesheet` this does NOT exclude
    continuous columns (e.g. ``age``) or identifiers — the user chooses; the plot
    renders categorical columns as discrete colours and continuous ones as a
    gradient. See ``docs/architecture/heatmap-konzept.md`` §4.
    """
    try:
        headers, col_values, total_samples = _read_samplesheet_columns(job_dir)
        if total_samples == 0:
            return []

        columns = []
        for i, header in enumerate(headers):
            values = col_values[i]
            if not values:  # fully empty column → nothing to annotate
                continue
            if header == BASENAME_COLUMN:  # system file-location key, not biology
                continue
            n_distinct = len(set(values))
            columns.append(
                {
                    "name": header,
                    "type": _classify_column(values, n_distinct, total_samples),
                    "n_distinct": n_distinct,
                }
            )

        return columns

    except Exception as e:
        raise AppException(
            ErrorTypes.INVALID_CSV_CONTENT,
            detail=f"The SampleSheet could not be analyzed for the heatmap: {e}",
        ) from e
