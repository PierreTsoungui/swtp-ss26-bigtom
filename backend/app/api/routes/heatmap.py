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
from app.services.batch_service import find_sample_sheet_name
from app.services.heatmap_service import get_grouping_options_from_samplesheet

router = APIRouter()

HEATMAP_FILENAME = "heatmap.png"


# ── 3.14  GET /{job_id}/options ───────────────────────────────────────────────

@router.get(
    "/{job_id}/options",
    response_model=HeatmapOptionsResponse,
    status_code=status.HTTP_200_OK,
)
def get_heatmap_options(job_id: str):
    """
    Gibt alle SampleSheet-Spalten zurück, die sich biologisch und mathematisch
    als Gruppierungsoption für die Heatmap eignen (≥ 2 Levels, kein eindeutiger
    Identifier, max. 50 % der Probenanzahl).
    """
    job_dir = heatmap_service.get_job_dir_or_404(job_id)
    available_cols = get_grouping_options_from_samplesheet(job_dir)
    return {"job_id": job_id, "available_columns": available_cols}


# ── 3.12  POST /{job_id} ──────────────────────────────────────────────────────

@router.post(
    "/{job_id}",
    response_model=HeatmapRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def run_heatmap(
    job_id: str,
    payload: HeatmapRequest,
    background_tasks: BackgroundTasks,
):
    """
    Startet die Heatmap-Generierung als Background-Task.
    Lehnt ab wenn:
      - Job nicht existiert (404)
      - Pipeline bereits läuft (409)
      - Grouping-Spalten nicht im SampleSheet vorhanden (422)
    Die CPG-Limit-Prüfung (max. 20) erfolgt innerhalb des R-Skripts; ein
    entsprechender Fehler wird über den Job-Status kommuniziert.
    """
    # 1. Job-Verzeichnis
    job_dir = heatmap_service.get_job_dir_or_404(job_id)

    # 2. Parallelstart verhindern
    current_job = job_manager.get_job(job_id)
    if current_job and current_job.status == "running":
        raise AppException(
            ErrorTypes.HEATMAP_NOT_ALLOWED,
            detail="Eine Pipeline läuft bereits für diesen Job.",
        )

    # 3. Grouping-Spalten gegen SampleSheet validieren
    available_cols = get_grouping_options_from_samplesheet(job_dir)

    if payload.grouping.primary not in available_cols:
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail=(
                f"Primäre Gruppierungsspalte '{payload.grouping.primary}' "
                f"nicht im SampleSheet gefunden."
            ),
            provided=payload.grouping.primary,
            available=available_cols,
        )

    if (
        payload.grouping.secondary
        and payload.grouping.secondary not in available_cols
    ):
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail=(
                f"Sekundäre Gruppierungsspalte '{payload.grouping.secondary}' "
                f"nicht im SampleSheet gefunden."
            ),
            provided=payload.grouping.secondary,
            available=available_cols,
        )

    if (
        payload.grouping.secondary
        and payload.grouping.primary == payload.grouping.secondary
    ):
        raise AppException(
            ErrorTypes.INVALID_GROUPING_COLUMN,
            detail="Primäre und sekundäre Gruppierungsspalte dürfen nicht identisch sein.",
        )

    # 4. DMP-RDS und SampleSheet lokalisieren
    dmp_rds    = heatmap_service._find_dmp_rds(job_dir)
    sheet_name = find_sample_sheet_name(str(job_dir))

    # 5. Status initialisieren & Task starten
    job_manager.update_job(
        job_id,
        status="running",
        phase="heatmap",
        progress_percent=0,
        current_step="Heatmap-Job in die Warteschlange eingereiht...",
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
        "phase":  "heatmap",
        "status": "running",
        "heatmap_metadata": {
            "detected_cpgs":   0,
            "plotted_samples": 0,
            "message":         "Heatmap-Generierung gestartet.",
        },
    }


# ── 3.13  GET /{job_id} ───────────────────────────────────────────────────────

@router.get("/{job_id}", status_code=status.HTTP_200_OK)
def get_heatmap_png(job_id: str):
    """
    Liefert die fertige heatmap.png als Binärdatei zurück.
    Gibt 404 zurück wenn die PNG noch nicht existiert
    (z. B. Pipeline läuft noch oder ist fehlgeschlagen).
    """
    job_dir = heatmap_service.get_job_dir_or_404(job_id)
    png_path = job_dir / HEATMAP_FILENAME

    if not png_path.exists():
        raise AppException(
            ErrorTypes.PLOT_NOT_FOUND,
            detail=f"Heatmap für Job '{job_id}' noch nicht verfügbar.",
        )

    return FileResponse(png_path, media_type="image/png")