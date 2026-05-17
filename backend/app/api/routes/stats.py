from fastapi import APIRouter, HTTPException
from app.services.job_manager import get_job
from datetime import datetime

router = APIRouter()


@router.get("/filter/{job_id}/stats")
async def get_filter_stats(job_id: str):
    job = get_job(job_id)

    # 1. Job existiert nicht
    if not job:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "JOB_NOT_FOUND",
                "message": "No job found for given job_id"
            }
        )

    # 2. Session abgelaufen
    if job.expires_at < datetime.now():
        raise HTTPException(
            status_code=410,
            detail={
                "error": "SESSION_EXPIRED",
                "message": "Die Sitzung ist abgelaufen."
            }
        )

    # 3. Filter noch nicht fertig
    if job.phase != "filtering_done":
        raise HTTPException(
            status_code=409,
            detail={
                "error": "FILTERING_NOT_FINISHED",
                "message": "Filterung ist noch nicht abgeschlossen."
            }
        )

    # 4. Kein Ergebnis vorhanden
    if not job.filter_stats:
        raise HTTPException(
            status_code=404,
            detail={
                "error": "NO_STATS_AVAILABLE",
                "message": "Keine Filterstatistik verfügbar."
            }
        )

    # 5. Erfolg → Stats zurückgeben
    return {
        "job_id": job.job_id,
        "filter_stats": job.filter_stats
    }