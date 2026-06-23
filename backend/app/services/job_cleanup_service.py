# app/services/job_cleanup_service.py
"""Entfernt abgelaufene Job-Verzeichnisse automatisch vom Server."""
import asyncio
import logging
import shutil
import time
from pathlib import Path

from app.core.config import (
    JOB_BASE_DIR,
    JOB_CLEANUP_INTERVAL_SECONDS,
    JOB_RETENTION_HOURS,
)

logger = logging.getLogger(__name__)


def cleanup_expired_jobs(
    jobs_dir: Path = JOB_BASE_DIR,
    retention_hours: float = JOB_RETENTION_HOURS,
    now: float | None = None,
) -> int:
    """Löscht abgelaufene Job-Verzeichnisse und gibt deren Anzahl zurück."""
    jobs_dir = Path(jobs_dir)
    if not jobs_dir.exists():
        logger.info("Job cleanup skipped: directory does not exist: %s", jobs_dir)
        return 0

    cutoff        = (time.time() if now is None else now) - retention_hours * 3600
    deleted_count = 0

    try:
        job_directories = list(jobs_dir.iterdir())
    except OSError:
        logger.exception("Failed to scan job directory: %s", jobs_dir)
        return 0

    for job_dir in job_directories:
        if not job_dir.is_dir():
            continue
        try:
            if job_dir.stat().st_mtime >= cutoff:
                continue
            shutil.rmtree(job_dir)
            deleted_count += 1
            logger.info("Deleted expired job directory: %s", job_dir)
        except OSError:
            logger.exception("Failed to delete expired job directory: %s", job_dir)

    logger.info(
        "Job cleanup finished: deleted %d expired director%s",
        deleted_count,
        "y" if deleted_count == 1 else "ies",
    )
    return deleted_count


async def run_job_cleanup_loop(
    jobs_dir: Path = JOB_BASE_DIR,
    retention_hours: float = JOB_RETENTION_HOURS,
    interval_seconds: int = JOB_CLEANUP_INTERVAL_SECONDS,
) -> None:
    """Führt die Job-Bereinigung dauerhaft im konfigurierten Intervall aus."""
    logger.info(
        "Job cleanup started: directory=%s, retention_hours=%s, interval_seconds=%s",
        jobs_dir, retention_hours, interval_seconds,
    )
    while True:
        try:
            await asyncio.to_thread(cleanup_expired_jobs, jobs_dir, retention_hours)
        except Exception:
            logger.exception("Unexpected error during job cleanup")
        await asyncio.sleep(interval_seconds)