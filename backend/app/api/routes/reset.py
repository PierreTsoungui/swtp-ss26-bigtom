# app/api/routes/reset.py
from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from app.core.error_types import AppException, ErrorTypes
from app.services import reset_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/reset/{job_id}")
async def reset_job(request: Request, job_id: str):
    """Cancel a running job (if any) and permanently delete it and its data.

    The endpoint is thin on purpose — all teardown logic lives in
    reset_service so it stays testable in isolation and reusable from other
    triggers (e.g. shutdown hooks).

    The success response is only returned once the job's data has actually been
    deleted from disk. If deletion fails, a 500 is returned instead of a false
    "ok", so the client never believes data was removed when it was not.
    """
    try:
        outcome = await reset_service.reset_job(job_id)
    except OSError as exc:
        logger.exception("[reset] Deletion failed: job_id=%s", job_id)
        raise AppException(
            ErrorTypes.RESET_FAILED,
            detail=f"Die Daten des Jobs '{job_id}' konnten nicht vollständig gelöscht werden.",
            instance=request.url.path,
            job_id=job_id,
        ) from exc

    if not outcome.found:
        raise AppException(
            ErrorTypes.JOB_NOT_FOUND,
            detail=f"Kein Job mit der ID '{job_id}' gefunden",
            instance=request.url.path,
            job_id=job_id,
        )

    return {
        "reset": True,
        "was_running": outcome.was_running,
        "already_in_progress": outcome.already_in_progress,
    }
