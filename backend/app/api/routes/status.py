# app/api/routes/status.py

from fastapi import APIRouter, HTTPException, Request
from datetime import datetime
from app.services.job_manager import get_job
from app.models.job import StatusResponse
from app.core.error_types import ErrorTypes, problem_detail

router = APIRouter()

@router.get("/status/{job_id}", response_model=StatusResponse)
async def get_status(request: Request, job_id: str):
    job = get_job(job_id)
    
    # Job nicht gefunden - 404
    if not job:
        raise HTTPException(
            status_code=404,
            detail=problem_detail(
                error_type=ErrorTypes.JOB_NOT_FOUND,
                detail=f"Kein Job mit der ID '{job_id}' gefunden",
                instance=request.url.path,
                job_id=job_id
            )
        )
    
    # Session abgelaufen - 410 (Gone)
    if job.expires_at < datetime.now():
        raise HTTPException(
            status_code=410,
            detail=problem_detail(
                error_type=ErrorTypes.SESSION_EXPIRED,
                detail="Die Sitzung ist abgelaufen, die Daten wurden gelöscht",
                instance=request.url.path,
                job_id=job_id,
                expires_at=job.expires_at.isoformat()
            )
        )
    
    # Rückgabe ohne filter_stats -> Entkopplung erfolgreich
    return StatusResponse(
        job_id=job.job_id,
        status=job.status,
        phase=job.phase,
        progress_percent=job.progress_percent,
        current_step=job.current_step,
        steps_total=job.steps_total,
        steps_completed=job.steps_completed,
        estimated_seconds_remaining=job.estimated_seconds_remaining,
        error=job.error  
    )