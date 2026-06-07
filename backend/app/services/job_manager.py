# app/services/job_manager.py

from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from app.models.job import JobStatus
# Die Aufbewahrungsdauer für Jobs wird jetzt aus der zentralen Konfiguration gelesen.
#
# Warum?
# Vorher war die Ablaufzeit direkt mit 24 Stunden im Code fest eingetragen.
# Das Ticket verlangt aber, dass die maximale Aufbewahrungsdauer konfigurierbar ist.
# Dadurch verwenden Job-Status und Cleanup-Service dieselbe Retention-Zeit.
from app.core.config import JOB_RETENTION_HOURS
import asyncio

# In-Memory Storage (für MVP)
jobs: Dict[str, JobStatus] = {}

# ← NEU: laufende Prozesse speichern
running_processes: Dict[str, asyncio.subprocess.Process] = {}

def create_job(job_id: str, temp_dir: str) -> JobStatus:
    job = JobStatus(
        job_id=job_id,
        status="queued",
        phase="uploaded",
        progress_percent=0,
        current_step="Files uploaded, waiting for processing...",
        temp_dir=temp_dir,
        created_at=datetime.now(),
        expires_at=datetime.now() + timedelta(hours=JOB_RETENTION_HOURS),
        preview_plots=None,
    )
    jobs[job_id] = job
    return job


def update_job(
    job_id: str,
    status: str = None,
    phase: str = None,
    progress_percent: int = None,
    current_step: str = None,
    steps_completed: int = None,
    filter_stats: Dict = None,
    normalization_method: str = None,
    error_message: str = None,
    error: Dict[str, Any] = None,
    preview_plots: Any = None,
    batch_history: Dict[str, Any] = None
) -> Optional[JobStatus]:
    if job_id not in jobs:
        return None

    job = jobs[job_id]
    if status:
        job.status = status
    if phase:
        job.phase = phase
    if progress_percent is not None:
        job.progress_percent = progress_percent
    if current_step:
        job.current_step = current_step
    if steps_completed is not None:
        job.steps_completed = steps_completed
    if filter_stats:
        job.filter_stats = filter_stats
    if normalization_method:
        job.normalization_method = normalization_method
    if error_message:
        job.error_message = error_message
    if error:
        job.error = error
    if preview_plots is not None:
        job.preview_plots = preview_plots
    if batch_history is not None:
        job.batch_history = batch_history

    jobs[job_id] = job
    return job


def get_job(job_id: str) -> Optional[JobStatus]:
    return jobs.get(job_id)


def delete_job(job_id: str) -> bool:
    if job_id in jobs:
        del jobs[job_id]
        return True
    return False


def save_filter_stats(job_id: str, filter_stats: Dict) -> Optional[JobStatus]:
    job = get_job(job_id)
    if not job:
        return None
    job.filter_stats = filter_stats
    jobs[job_id] = job
    return job


# ── NEU: Process-Tracking für Cancel/Reset ──────────────────────────────────

def register_process(job_id: str, process: asyncio.subprocess.Process) -> None:
    """Speichert den laufenden R-Prozess damit er später gekillt werden kann."""
    running_processes[job_id] = process


def unregister_process(job_id: str) -> None:
    """Entfernt den Prozess nach Abschluss oder Abbruch."""
    running_processes.pop(job_id, None)


async def kill_process(job_id: str) -> bool:
    """Beendet den laufenden R-Prozess falls vorhanden. Gibt True zurück wenn gekillt."""
    process = running_processes.get(job_id)
    if process and process.returncode is None:  # läuft noch
        process.kill()
        await process.wait()
        unregister_process(job_id)
        return True
    return False


def reset_job(job_id: str) -> Optional[JobStatus]:
    """Setzt Job-Status auf canceled und resettet alle Felder."""
    return update_job(
        job_id=job_id,
        status="canceled",
        phase="reset",
        progress_percent=0,
        current_step="Analysis canceled by user.",
        steps_completed=0,
        error_message=None,
        error=None,
    )