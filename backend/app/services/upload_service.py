# app/services/upload_service.py
"""Upload domain logic: persist an upload and run the filtering → preview pipeline.

The upload route stays a thin HTTP adapter; everything that is business logic
(saving files with rollback, sequencing the first pipeline phase) lives here.
"""
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import List

from fastapi import UploadFile

from app.core.error_types import AppException, ErrorTypes
from app.models.filter import FilterSettings
from app.services import job_manager
from app.services.file_handler import (
    save_idat_files,
    save_sample_sheet,
    save_filter_settings,
    clean_job_files,
)
from app.services.job_manager import JobPhase, JobStatusValue
from app.services.normalization_preview_service import run_normalization_preview
from app.services.r_executor import run_r_script, FilteringCommand

logger = logging.getLogger(__name__)


def persist_upload_files(
    job_id: str,
    job_dir: Path,
    idat_files: List[UploadFile],
    sample_sheet: UploadFile,
    filter_settings: FilterSettings,
    instance: str,
) -> None:
    """Persist the uploaded IDATs, sample sheet, and filter settings.

    On any failure the partially written job directory is rolled back and an
    ``AppException`` is raised (rendered as an RFC-9457 problem by the global
    handler). ``instance`` is the request path, included in the error body.
    """
    try:
        save_idat_files(idat_files, job_dir)
        save_sample_sheet(sample_sheet, job_dir)
        save_filter_settings(filter_settings.model_dump(), job_dir)
    except ValueError as exc:
        clean_job_files(job_id)
        raise AppException(ErrorTypes.INVALID_UPLOAD, str(exc), instance) from exc
    except Exception as exc:
        clean_job_files(job_id)
        raise AppException(
            ErrorTypes.SAVE_FAILED, f"Fehler beim Speichern: {exc}", instance
        ) from exc


async def run_upload_pipeline(
    job_id: str,
    job_dir: str,
    sample_sheet_filename: str,
    filter_settings: FilterSettings,
    cancel_event: asyncio.Event,
) -> None:
    """Filtering followed by the normalization preview, as one pipeline phase.

    The ``cancel_event`` is injected by ``pipeline_task.run_job_pipeline`` — this
    coroutine never creates or registers it (see r-executor.md §6).
    """
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.FILTERING,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step="Starte Filterung der Rohdaten...",
    )

    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            job_manager.set_progress(
                job_id,
                percent=data.get("percent", data.get("progress_percent", 0)),
                message=data.get("message", data.get("current_step", "")),
            )

    result = await run_r_script(
        command=FilteringCommand(
            script="init_filter.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet=sample_sheet_filename,
            extra_args=[json.dumps(filter_settings.model_dump())],
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    # Cancellation is a clean outcome: reset_service owns deletion, do not
    # write a terminal state here.
    if result.is_cancelled:
        logger.info("Job execution cancelled cleanly via reset: job_id=%s", job_id)
        return

    if result.is_timeout:
        logger.error("Job execution timed out: job_id=%s", job_id)
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.FILTERING,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler: Das R-Skript hat das Zeitlimit überschritten.",
            error={"detail": "R script execution timeout."},
        )
        return

    if not result.is_success:
        logger.error("Filtering script failed: job_id=%s returncode=%s", job_id, result.returncode)
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.FILTERING,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler während der Filterung.",
            error={"detail": result.extra.get("r_error") or result.stderr or "R-Skript abgebrochen."},
        )
        return

    # init_filter.R must emit filter_stats.json; its absence means a silent failure.
    filter_stats = result.extra.get("filter_stats")
    if not filter_stats:
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.FILTERING,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler: filter_stats.json wurde nicht erzeugt.",
            error={"detail": "filter_stats.json missing."},
        )
        return

    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.FILTERING,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Filterung abgeschlossen.",
    )
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION_PREVIEW,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step="Starte Normalisierungs-Preview...",
    )

    # The same cancel_event flows into the preview step, so a reset during the
    # preview is honored too.
    await run_normalization_preview(
        job_id,
        job_dir,
        os.path.join(job_dir, sample_sheet_filename),
        cancel_event,
    )
