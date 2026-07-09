# app/api/routes/normalize.py
"""Route for starting the normalization step for a job."""

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request

from app.core.error_types import ErrorTypes, problem_detail
from app.models.normalize import NormalizeRequest, NormalizeResponse
from app.services import normalize_service, pipeline_task
from app.services.job_manager import JobPhase, JobStatusValue, get_job, transition_job

logger = logging.getLogger(__name__)
router = APIRouter()

VALID_METHODS = {"noob", "quantile", "swan", "funnorm", "raw"}


@router.post("/normalize/{job_id}", response_model=NormalizeResponse, status_code=202)
async def start_normalization(
    request: Request,
    background_tasks: BackgroundTasks,
    job_id: str,
    body: NormalizeRequest,
):
    """Validate the method and start the normalization pipeline in the background.

    Raises:
        HTTPException: 404 if the job is unknown, 400 for an invalid method.
    """
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

    method = body.method.lower()
    if method not in VALID_METHODS:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.INVALID_NORMALIZATION_METHOD,
                detail=f"Invalid method '{body.method}'. Allowed: {', '.join(VALID_METHODS)}",
                instance=request.url.path,
                job_id=job_id,
                provided_method=body.method,
                allowed_methods=list(VALID_METHODS),
            ),
        )

    # Enter the running state synchronously so a follow-up status poll never
    # races ahead of the background task. The pipeline itself only takes the
    # job further from here.
    transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step=f"Starting normalization with method '{method}'...",
    )

    # The pipeline lifecycle (cancel_event creation, task registration, cleanup)
    # is owned entirely by pipeline_task.run_job_pipeline — see heatmap/upload
    # for the same pattern. The service coroutine only receives the cancel_event.
    background_tasks.add_task(
        pipeline_task.run_job_pipeline,
        job_id,
        lambda cancel_event: normalize_service.run_normalization_pipeline(
            job_id, job_id, method, cancel_event
        ),
    )

    return NormalizeResponse(job_id=job_id, status=JobStatusValue.RUNNING.value, method=method)
