# app/api/routes/normalization_preview.py
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.services.job_manager import get_job, JobPhase, JobStatusValue

router = APIRouter()

JOBS_DIR = Path("jobs").resolve()

_ALLOWED_PLOT_PREFIXES = ("density_", "pca_")


@router.get("/preview/normalization/{job_id}")
async def get_preview(job_id: str):
    job = get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail={"error": "JOB_NOT_FOUND", "message": "Kein Job gefunden"},
        )

    # Preview liegt erst ab normalization_preview/completed vor
    preview_ready = (
        job.phase == JobPhase.NORMALIZATION_PREVIEW.value
        and job.status == JobStatusValue.COMPLETED.value
    ) or job.phase not in {
        JobPhase.UPLOADED.value,
        JobPhase.FILTERING.value,
        JobPhase.NORMALIZATION_PREVIEW.value,
    }

    if not preview_ready:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "PREVIEW_NOT_READY",
                "message": "Normalisierungs-Preview noch nicht verfügbar",
                "current_phase": job.phase,
                "current_status": job.status,
            },
        )

    # preview_plots.json vom Dateisystem lesen
    plots_path = JOBS_DIR / job_id / "preview_plots.json"
    if not plots_path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "PREVIEW_NOT_READY", "message": "preview_plots.json nicht gefunden"},
        )

    with open(plots_path, "r", encoding="utf-8") as f:
        preview_plots = json.load(f)

    return {
        "job_id": job_id,
        "plots": [
            {
                "method": method,
                "plots": [
                    {
                        "plot_kind": p["plot_kind"].lower(),
                        "url": f"/api/v1/preview/normalization/{job_id}/{p['file']}",
                    }
                    for p in items
                ],
            }
            for method, items in preview_plots.items()
        ],
    }


@router.get("/preview/normalization/{job_id}/{plot_name}")
async def get_plot_image(job_id: str, plot_name: str):
    job = get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")

    if not plot_name.startswith(_ALLOWED_PLOT_PREFIXES):
        raise HTTPException(status_code=400, detail="Ungültiger Plot-Name")

    path = JOBS_DIR / job_id / plot_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Plot nicht gefunden")

    return FileResponse(path, media_type="image/png")