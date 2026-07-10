# app/api/routes/stats.py
"""Route for retrieving the filter statistics of a job."""

import json

from fastapi import APIRouter, HTTPException, Request

from app.core.error_types import ErrorTypes, problem_detail
from app.services.job_manager import JobPhase, JobStatusValue, get_job
from app.services.job_paths import JOBS_DIR, validate_job_id

router = APIRouter()

# Phases in which filtering is not finished yet
_PHASES_BEFORE_STATS = {
    JobPhase.UPLOADED.value,
    JobPhase.FILTERING.value,
}


@router.get("/filter/{job_id}/stats")
async def get_filter_stats(request: Request, job_id: str):
    """Return a job's filter_stats.json once filtering has finished.

    Raises:
        HTTPException: 404 if the job is unknown, 409 if filtering is not
            finished or the statistics are not available yet.
    """
    validate_job_id(job_id)  # traversal guard before the id reaches the FS below
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

    # Filtering not finished yet
    if job.phase in _PHASES_BEFORE_STATS:
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail=f"Filtering is not finished yet (phase: {job.phase})",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
                progress_percent=job.progress_percent,
            ),
        )

    # Filtering failed
    if job.phase == JobPhase.FILTERING.value and job.status == JobStatusValue.FAILED.value:
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail="Filtering failed.",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
            ),
        )

    # Read filter_stats.json from the filesystem
    stats_path = JOBS_DIR / job_id / "filter_stats.json"
    if not stats_path.exists():
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail="Filter statistics are not available yet.",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
                progress_percent=job.progress_percent,
            ),
        )

    with open(stats_path, encoding="utf-8") as f:
        return json.load(f)
