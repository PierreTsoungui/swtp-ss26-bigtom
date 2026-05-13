from fastapi import APIRouter, BackgroundTasks, HTTPException
from datetime import datetime

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

    # Preview noch nicht fertig
    if job.phase != "waiting_selection":
        raise HTTPException(
            status_code=409,
            detail={
                "error": "PREVIEW_NOT_READY",
                "message": "Normalization preview still running"
            }
        )

    return {
        "job_id": job_id,
        "plots": job.preview_plots,
        "count": len(job.preview_plots)
    }