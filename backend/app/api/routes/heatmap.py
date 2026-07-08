# app/api/routes/heatmap.py
"""Routes for the heatmap: annotation options, running it and fetching the image."""
from fastapi import APIRouter, Query, status
from fastapi.responses import FileResponse

from app.core.error_types import AppException, ErrorTypes
from app.core.exceptions import JobSessionExpiredError
from app.models.heatmap import (
    HeatmapRequest,
    HeatmapRunResponse,
    HeatmapOptionsResponse,
)
from app.services import heatmap_service, job_manager
from app.services.job_manager import transition_job, JobPhase, JobStatusValue
from app.services.batch_service import find_sample_sheet_name
from app.services.heatmap_service import find_annotation_columns
from app.services.pipeline_task import start_job_pipeline

router = APIRouter()

_OUTPUT_FILES = {"png": "heatmap.png", "pdf": "heatmap.pdf"}
_MEDIA_TYPES  = {"png": "image/png", "pdf": "application/pdf"}


@router.get("/{job_id}/options", response_model=HeatmapOptionsResponse, status_code=status.HTTP_200_OK)
def get_heatmap_options(job_id: str):
    """Return the sample-sheet columns available as heatmap annotations."""
    job_dir = heatmap_service.get_job_dir_or_404(job_id)
    return {"job_id": job_id, "available_columns": find_annotation_columns(job_dir)}


@router.post("/{job_id}", response_model=HeatmapRunResponse, status_code=status.HTTP_202_ACCEPTED)
async def run_heatmap(job_id: str, payload: HeatmapRequest):
    """Validate the grouping/filters and start a heatmap run in the background."""
    job_dir = heatmap_service.get_job_dir_or_404(job_id)

    # The job directory can outlive its in-memory session (e.g. after a backend
    # restart): the files are still on disk but the job manager no longer knows
    # the job. Fail fast with a clean 410 here, before any filtering work runs,
    # rather than letting transition_job blow up mid-way (see JobSessionExpiredError).
    current_job = job_manager.get_job(job_id)
    if current_job is None:
        raise JobSessionExpiredError(job_id)
    if current_job.status == JobStatusValue.RUNNING.value:
        raise AppException(
            ErrorTypes.HEATMAP_NOT_ALLOWED,
            detail="A pipeline is already running for this job.",
        )

    # ── Validate the chosen annotation columns against the sample sheet ──────
    available = [c["name"] for c in find_annotation_columns(job_dir)]
    if payload.grouping.primary not in available:
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail=f"Primary grouping column '{payload.grouping.primary}' is not in the sample sheet.",
            provided=payload.grouping.primary,
            available=available,
        )
    if payload.grouping.secondary and payload.grouping.secondary not in available:
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail=f"Secondary grouping column '{payload.grouping.secondary}' is not in the sample sheet.",
            provided=payload.grouping.secondary,
            available=available,
        )
    if payload.grouping.secondary and payload.grouping.primary == payload.grouping.secondary:
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail="The primary and secondary grouping columns must not be identical.",
        )

    dmp_rds    = heatmap_service._find_dmp_rds(job_dir)
    sheet_name = find_sample_sheet_name(str(job_dir))

    # ── Single filter source + 500 gate (raises 400 before R is started) ────
    selected_cpgs = heatmap_service.prepare_heatmap_input(job_id, job_dir, payload.filters)

    transition_job(
        job_id,
        new_phase=JobPhase.HEATMAP,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step="Heatmap generation started...",
    )

    start_job_pipeline(
        job_id,
        lambda cancel_event: heatmap_service.run_heatmap_pipeline_task(
            job_id, job_dir, dmp_rds, sheet_name, payload.grouping, cancel_event,
        ),
    )

    return {
        "job_id": job_id,
        "phase":  JobPhase.HEATMAP.value,
        "status": JobStatusValue.RUNNING.value,
        "heatmap_metadata": {
            "detected_cpgs":   selected_cpgs,
            "plotted_samples": 0,
            "message": "Heatmap generation started.",
        },
    }


@router.get("/{job_id}", status_code=status.HTTP_200_OK)
def get_heatmap(job_id: str, format: str = Query("png", pattern="^(png|pdf)$")):
    """Return the rendered heatmap for a job as a PNG (default) or PDF file."""
    job_dir = heatmap_service.get_job_dir_or_404(job_id)
    file_path = job_dir / _OUTPUT_FILES[format]

    if not file_path.exists():
        raise AppException(
            ErrorTypes.PLOT_NOT_FOUND,
            detail=f"Heatmap ({format.upper()}) for job '{job_id}' is not available yet.",
        )

    return FileResponse(file_path, media_type=_MEDIA_TYPES[format])
