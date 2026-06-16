# app/api/routes/filter.py
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from app.services.job_manager import get_job, JobPhase, JobStatusValue
from app.core.error_types import ErrorTypes, problem_detail

router = APIRouter()

JOBS_DIR = Path("jobs").resolve()

# Phasen, in denen die Filterung noch nicht abgeschlossen ist
_PHASES_BEFORE_STATS = {
    JobPhase.UPLOADED.value,
    JobPhase.FILTERING.value,
}


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
                job_id=job_id,
            ),
        )

    # Filterung noch nicht abgeschlossen
    if job.phase in _PHASES_BEFORE_STATS:
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail=f"Filterung ist noch nicht abgeschlossen (Phase: {job.phase})",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
                progress_percent=job.progress_percent,
            ),
        )

    # Filterung fehlgeschlagen
    if job.phase == JobPhase.FILTERING.value and job.status == JobStatusValue.FAILED.value:
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail="Filterung ist fehlgeschlagen.",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
            ),
        )

    # filter_stats.json vom Dateisystem lesen
    stats_path = JOBS_DIR / job_id / "filter_stats.json"
    if not stats_path.exists():
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.FILTERING_NOT_FINISHED,
                detail="Filterstatistiken noch nicht verfügbar.",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
                progress_percent=job.progress_percent,
            ),
        )

    with open(stats_path, "r", encoding="utf-8") as f:
        return json.load(f)