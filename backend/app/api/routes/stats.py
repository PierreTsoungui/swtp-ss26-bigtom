# app/api/routes/filter.py
from fastapi import APIRouter, HTTPException, Request
from app.services.job_manager import get_job
from app.core.error_types import ErrorTypes, problem_detail
from datetime import datetime

router = APIRouter()


@router.get("/filter/{job_id}/stats")
async def get_filter_stats(request: Request, job_id: str):
    job = get_job(job_id)

    
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

    PHASES_BEFORE_STATS = {"filtering"}
   
    if job.phase in PHASES_BEFORE_STATS :
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail=f"Filterung ist noch nicht abgeschlossen (aktueller Status: {job.phase})",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
                progress_percent=job.progress_percent
            )
        )

   
    if not job.filter_stats:
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail=f"Filterstatistiken noch nicht verfügbar (Phase: {job.phase})",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
                progress_percent=job.progress_percent
            )
        )

    
    return job.filter_stats