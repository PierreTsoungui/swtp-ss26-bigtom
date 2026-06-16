# app/api/routes/heatmap.py
from fastapi import APIRouter, BackgroundTasks, status
from fastapi.responses import FileResponse

from app.core.error_types import AppException, ErrorTypes
from app.models.heatmap import (
    HeatmapRequest,
    HeatmapRunResponse,
    HeatmapOptionsResponse,
)
from app.services import heatmap_service, job_manager
from app.services.job_manager import transition_job, JobPhase, JobStatusValue
from app.services.batch_service import find_sample_sheet_name
from app.services.heatmap_service import get_grouping_options_from_samplesheet

router = APIRouter()

HEATMAP_FILENAME = "heatmap.png"


@router.get("/{job_id}/options", response_model=HeatmapOptionsResponse, status_code=status.HTTP_200_OK)
def get_heatmap_options(job_id: str):
    job_dir        = heatmap_service.get_job_dir_or_404(job_id)
    available_cols = get_grouping_options_from_samplesheet(job_dir)
    return {"job_id": job_id, "available_columns": available_cols}


@router.post("/{job_id}", response_model=HeatmapRunResponse, status_code=status.HTTP_202_ACCEPTED)
def run_heatmap(job_id: str, payload: HeatmapRequest, background_tasks: BackgroundTasks):
    # Job-Verzeichnis
    job_dir = heatmap_service.get_job_dir_or_404(job_id)

    # Parallelstart verhindern
    current_job = job_manager.get_job(job_id)
    if current_job and current_job.status == JobStatusValue.RUNNING.value:
        raise AppException(
            ErrorTypes.HEATMAP_NOT_ALLOWED,
            detail="Eine Pipeline läuft bereits für diesen Job.",
        )

    # Grouping-Spalten validieren
    available_cols = get_grouping_options_from_samplesheet(job_dir)

    if payload.grouping.primary not in available_cols:
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail=f"Primäre Gruppierungsspalte '{payload.grouping.primary}' nicht im SampleSheet.",
            provided=payload.grouping.primary,
            available=available_cols,
        )

    if payload.grouping.secondary and payload.grouping.secondary not in available_cols:
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail=f"Sekundäre Gruppierungsspalte '{payload.grouping.secondary}' nicht im SampleSheet.",
            provided=payload.grouping.secondary,
            available=available_cols,
        )

    if payload.grouping.secondary and payload.grouping.primary == payload.grouping.secondary:
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail="Primäre und sekundäre Gruppierungsspalte dürfen nicht identisch sein.",
        )

    # DMP-RDS und SampleSheet lokalisieren
    dmp_rds    = heatmap_service._find_dmp_rds(job_dir)
    sheet_name = find_sample_sheet_name(str(job_dir))

    # Heatmap-Phase starten
    transition_job(
        job_id,
        new_phase=JobPhase.HEATMAP,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step="Heatmap-Generierung gestartet...",
    )

    background_tasks.add_task(
        heatmap_service.run_heatmap_pipeline_task,
        job_id,
        job_dir,
        dmp_rds,
        sheet_name,
        payload.grouping,
        payload.dmp_filter,
    )

    return {
        "job_id": job_id,
        "phase":  JobPhase.HEATMAP.value,
        "status": JobStatusValue.RUNNING.value,
        "heatmap_metadata": {
            "detected_cpgs":   0,
            "plotted_samples": 0,
            "message":         "Heatmap-Generierung gestartet.",
        },
    }


@router.get("/{job_id}", status_code=status.HTTP_200_OK)
def get_heatmap_png(job_id: str):
    job_dir  = heatmap_service.get_job_dir_or_404(job_id)
    png_path = job_dir / HEATMAP_FILENAME

    if not png_path.exists():
        raise AppException(
            ErrorTypes.PLOT_NOT_FOUND,
            detail=f"Heatmap für Job '{job_id}' noch nicht verfügbar.",
        )

    return FileResponse(png_path, media_type="image/png")