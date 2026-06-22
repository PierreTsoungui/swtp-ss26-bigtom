# app/api/routes/reset.py
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from app.core.error_types import ErrorTypes, problem_detail
from app.services import reset_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/reset/{job_id}")
async def reset_job(request: Request, job_id: str):
    """Cancel a running job (if any) and delete it.

    The endpoint is thin on purpose — all teardown logic lives in
    reset_service so it stays testable in isolation and reusable from other
    triggers (e.g. shutdown hooks).
    """
    outcome = await reset_service.reset_job(job_id)

    if not outcome.found:
        raise HTTPException(
            status_code=404,
            detail=problem_detail(
                error_type=ErrorTypes.JOB_NOT_FOUND,
                detail=f"Kein Job mit der ID '{job_id}' gefunden",
                instance=request.url.path,
                job_id=job_id,
            ),
        )

    return {
        "reset": True,
        "was_running": outcome.was_running,
        "already_in_progress": outcome.already_in_progress,
    }
