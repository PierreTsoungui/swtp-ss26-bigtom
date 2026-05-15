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

    plot_names = ["norm_raw.png", "norm_noob.png", "norm_quantile.png",
                  "norm_swan.png", "norm_funnorm.png"]
    plots = [
        f"/api/v1/preview/normalization/{job_id}/{name}"
        for name in plot_names
        if (Path(job.temp_dir) / name).exists()
    ]

    return {"job_id": job_id, "plots": plots, "count": len(plots)}


@router.get("/preview/normalization/{job_id}/{plot_name}")
async def get_plot_image(job_id: str, plot_name: str):
    allowed = {"norm_raw.png", "norm_noob.png", "norm_quantile.png",
               "norm_swan.png", "norm_funnorm.png"}
    if plot_name not in allowed:
        raise HTTPException(status_code=400, detail="Unknown plot")
    
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404)
    
    path = Path(job.temp_dir) / plot_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Plot not found")
    
    return FileResponse(path, media_type="image/png")