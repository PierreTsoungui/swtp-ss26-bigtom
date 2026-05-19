from fastapi import APIRouter, HTTPException
from app.services import job_manager

router = APIRouter()


@router.post("/reset/{job_id}")
async def reset_job(job_id: str):
    """
    Bricht eine laufende Analyse ab und setzt den Job-Status auf 'canceled'.
    Die Session (Dateien, job_id) bleibt erhalten.
    """
    # 1. Job existiert?
    job = job_manager.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "type": "https://bigtom.app/errors/job-not-found",
                "title": "Job not found",
                "status": 404,
                "detail": f"No job found for job_id '{job_id}'.",
                "instance": f"/reset/{job_id}"
            }
        )

    # 2. Ist der Job überhaupt abbrechbar?
    NON_CANCELABLE = {"completed", "canceled", "failed"}
    if job.status in NON_CANCELABLE:
        raise HTTPException(
            status_code=409,
            detail={
                "type": "https://bigtom.app/errors/invalid-state",
                "title": "Job cannot be canceled",
                "status": 409,
                "detail": f"Job is already in state '{job.status}' and cannot be canceled.",
                "instance": f"/reset/{job_id}"
            }
        )

    # 3. Laufenden R-Prozess killen (falls vorhanden)
    await job_manager.kill_process(job_id)

    # 4. Job-Status zurücksetzen
    job_manager.reset_job(job_id)

    return {
        "reset": True,
        "status": "canceled"
    }