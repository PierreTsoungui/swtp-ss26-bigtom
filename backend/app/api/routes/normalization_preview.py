from collections import defaultdict

from fastapi import APIRouter, BackgroundTasks, HTTPException
from datetime import datetime
from fastapi.responses import FileResponse
from pathlib import Path


from app.services.job_manager import get_job, update_job
from app.services.normalization_preview_service import (
    run_normalization_preview
)

router = APIRouter()


@router.post("/preview/normalization/{job_id}", status_code=202)
async def start_preview(
    job_id: str,
    background_tasks: BackgroundTasks
):

    job = get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "JOB_NOT_FOUND",
                "message": "No job found"
            }
        )

    if job.expires_at < datetime.now():
        raise HTTPException(
            status_code=410,
            detail={
                "error": "SESSION_EXPIRED",
                "message": "Session expired"
            }
        )

    update_job(
        job_id,
        status="running",
        phase="normalization_preview",
        progress_percent=0,
        current_step="Starting normalization preview..."
    )

    background_tasks.add_task(
        run_normalization_preview,
        job_id,
        job.temp_dir
    )

    return {
        "job_id": job_id,
        "status": "accepted"
    }


@router.get("/preview/normalization/{job_id}")
async def get_preview(job_id: str):

    job = get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail={"error": "JOB_NOT_FOUND", "message": "No job found"}
        )

    if job.expires_at < datetime.now():
        raise HTTPException(
            status_code=410,
            detail={"error": "SESSION_EXPIRED", "message": "Session expired"}
        )

    preview_plots = getattr(job, "preview_plots", [])
   
    return {
        "job_id": job_id,
        "plots": [
            {
                "method": method,
                "plots": [
                    {
                    "plot_kind": p["plot_kind"].lower(),
                    "url": f"/api/v1/preview/normalization/{job_id}/{p['file']}"
                    }
                    for p in items
             ]
            }
            for method, items in preview_plots.items()
        ]
    }
@router.get("/preview/normalization/{job_id}/{plot_name}")
async def get_plot_image(job_id: str, plot_name: str):

    job = get_job(job_id)

    if not job:
        raise HTTPException(status_code=404)

    allowed_prefixes = (
        "density_",
        "pca_"
    )

    if not plot_name.startswith(allowed_prefixes):
        raise HTTPException(status_code=400, detail="Invalid plot name")

   
    path = Path(job.temp_dir) / plot_name

    if not path.exists():
        raise HTTPException(status_code=404, detail="Plot not found")

    return FileResponse(path, media_type="image/png")