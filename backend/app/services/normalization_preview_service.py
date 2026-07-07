# app/services/normalization_preview_service.py
"""Normalization-preview pipeline: run the R preview and collect its artifacts."""
import asyncio
import json
import logging
from pathlib import Path

from app.services import job_manager
from app.services.job_manager import JobPhase, JobStatusValue
from app.services.pipeline_outcome import progress_fields, handle_step_result, StepOutcome
from app.services.r_executor import run_r_script, NormalizationPreviewCommand

logger = logging.getLogger(__name__)


def _scan_preview_artifacts(job_path: Path) -> dict[str, dict]:
    """Collect the per-method preview artifacts written by the R script.

    Returns ``{method: {"density": <png filename|None>, "pca": <json filename|None>}}``.
    Only the expected ``density_<method>.png`` and ``pca_<method>.json`` files are
    picked up, so unrelated files in the job dir (filter_settings.json,
    preview_plots.json, …) are ignored.
    """
    artifacts: dict[str, dict] = {}

    for png_file in sorted(job_path.glob("density_*.png")):
        method = png_file.stem[len("density_"):]
        artifacts.setdefault(method, {"density": None, "pca": None})["density"] = png_file.name

    for json_file in sorted(job_path.glob("pca_*.json")):
        method = json_file.stem[len("pca_"):]
        artifacts.setdefault(method, {"density": None, "pca": None})["pca"] = json_file.name

    return artifacts


async def run_normalization_preview(
    job_id: str,
    job_dir: str,
    sample_sheet: str,
    cancel_event: asyncio.Event,
) -> None:
    """Run normalization_preview.R and persist preview_plots.json.

    The cancel_event is injected by the caller (it shares the job's pipeline
    cancel_event) rather than looked up from the registry — this keeps the
    data flow explicit and decoupled from global registry state.

    Plot detection scans the job directory for PNG files, which is more robust
    than stdout parsing because it works regardless of whether R emitted the
    plot JSON messages.
    """
    sample_sheet_name = Path(sample_sheet).name

    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            percent, message = progress_fields(data)
            job_manager.set_progress(job_id, percent=percent, message=message)

    result = await run_r_script(
        command=NormalizationPreviewCommand(
            script="normalization_preview.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet=sample_sheet_name,
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    if handle_step_result(
        job_id,
        result,
        phase=JobPhase.NORMALIZATION_PREVIEW,
        fallback="The R script exited with an error.",
        timeout_step="Error: the R script exceeded its time limit.",
        timeout_detail="Normalization preview timeout.",
        failure_step="Error during the normalization preview.",
        cancel_log=f"Normalization preview cancelled: job_id={job_id}",
    ) is not StepOutcome.SUCCESS:
        return

    # ── Plot detection: filesystem scan (primary strategy) ───────────────────
    # normalization_preview.R writes two artifacts per method:
    #   density_<method>.png  – server-rendered density plot (static)
    #   pca_<method>.json     – PCA points for the interactive frontend plotter
    # Both are collected here so the frontend can show the density plot per
    # method and render the PCA dynamically.
    job_path = Path(job_dir)
    preview_plots = _scan_preview_artifacts(job_path)

    logger.info(
        "Preview scan finished: job_id=%s methods=%s",
        job_id,
        {m: {k: v for k, v in arts.items() if v} for m, arts in preview_plots.items()},
    )

    if not preview_plots:
        logger.error(
            "No preview artifacts in the job directory: job_id=%s job_dir=%s",
            job_id, job_dir,
        )
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.FAILED,
            current_step="Error: no plots found in the job directory.",
            error={"detail": f"No preview files found in {job_dir}."},
        )
        return

    # ── Persist preview_plots.json ───────────────────────────────────────────
    plots_path = job_path / "preview_plots.json"
    try:
        with open(plots_path, "w", encoding="utf-8") as f:
            json.dump(preview_plots, f, indent=2)
        logger.info(
            "preview_plots.json saved: job_id=%s plot_count=%d",
            job_id,
            sum(len(v) for v in preview_plots.values()),
        )
    except Exception:
        logger.exception("Error saving preview_plots.json: job_id=%s", job_id)
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.FAILED,
            current_step="Error while saving the preview plots.",
            error={"detail": "preview_plots.json could not be saved."},
        )
        return

    # ── Phase transitions ────────────────────────────────────────────────────
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION_PREVIEW,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Normalization preview completed.",
    )
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.WAITING,
        current_step="Waiting for the normalization method selection...",
    )