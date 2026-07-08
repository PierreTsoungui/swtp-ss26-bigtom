# app/api/routes/status.py
"""Route for polling a job's current status."""
from fastapi import APIRouter, HTTPException, Request
from app.services.job_manager import get_job
from app.models.job import StatusResponse
from app.core.error_types import ErrorTypes, problem_detail

router = APIRouter()


@router.get("/status/{job_id}", response_model=StatusResponse)
async def get_status(request: Request, job_id: str):
    """Return the current phase, status and progress of a job (404 if unknown)."""
    job = get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail=problem_detail(
                error_type=ErrorTypes.JOB_NOT_FOUND,
                detail=f"No job found with id '{job_id}'",
                instance=request.url.path,
                job_id=job_id,
            ),
        )

    return StatusResponse(
        job_id=job.job_id,
        status=job.status,
        phase=job.phase,
        progress_percent=job.progress_percent,
        current_step=job.current_step,
        error=job.error,
    )