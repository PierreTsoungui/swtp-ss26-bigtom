from fastapi import APIRouter, HTTPException
from app.services.job_manager import get_job
from app.models.job import StatusResponse

router = APIRouter()

@router.get("/status/{job_id}", response_model=StatusResponse)
async def get_status(job_id: str):
    job = get_job(job_id)
    
    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "JOB_NOT_FOUND",
                "message": "No job found for given job_id"
            }
        )
    
    # Prüfen ob Session abgelaufen
    from datetime import datetime
    if job.expires_at < datetime.now():
        raise HTTPException(
            status_code=410,
            detail={
                "error": "SESSION_EXPIRED",
                "message": "Die Sitzung ist abgelaufen und die Daten wurden bereits gelöscht."
            }
        )
    
    return StatusResponse(
        job_id=job.job_id,
        status=job.status,
        phase=job.phase,
        progress_percent=job.progress_percent,
        current_step=job.current_step,
        steps_total=job.steps_total,
        steps_completed=job.steps_completed,
        filter_stats=job.filter_stats,
        estimated_seconds_remaining=job.estimated_seconds_remaining
    )