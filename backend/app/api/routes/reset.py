# app/api/routes/reset.py
from fastapi import APIRouter, HTTPException, Request
from app.services.job_manager import get_job, kill_process, delete_job
from app.core.error_types import ErrorTypes, problem_detail

router = APIRouter()


@router.post("/reset/{job_id}")
async def reset_job(request: Request, job_id: str):
    """
    Bricht einen laufenden Job ab und löscht ihn.
    Das Frontend navigiert danach zur Upload-Page und erstellt einen neuen Job.
    """
    job = get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail=problem_detail(
                error_type=ErrorTypes.JOB_NOT_FOUND,
                detail=f"Kein Job mit der ID '{job_id}' gefunden",
                instance=request.url.path,
                job_id=job_id,
            ),
        )

    await kill_process(job_id)
    delete_job(job_id)

    return {"reset": True}