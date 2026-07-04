"""Intake guards shared by every upload path.

Reject a job before any work starts when it would blow the deployment budget:
  * too many samples for the RAM budget (peak memory scales with sample count),
  * the job storage area is already full.

Both limits come from :mod:`app.core.config` (env-configurable, 0 = disabled).
The container ``mem_limit`` / disk are the hard backstops; these guards turn a
would-be mid-pipeline OOM or a full disk into a clear, early error message.
"""

import logging

from app.core import config
from app.core.error_types import AppException, ErrorTypes

logger = logging.getLogger(__name__)


def enforce_sample_limit(n_samples: int, instance: str) -> None:
    """Reject cohorts larger than ``MAX_SAMPLES_PER_JOB`` (0 = unlimited)."""
    limit = config.MAX_SAMPLES_PER_JOB
    if limit and n_samples > limit:
        logger.warning("Upload rejected: %d samples exceeds limit %d", n_samples, limit)
        raise AppException(
            ErrorTypes.TOO_MANY_SAMPLES,
            f"Diese Analyse enthält {n_samples} Proben, das Limit sind {limit}. "
            f"Bitte weniger Proben auswählen (oder MAX_SAMPLES_PER_JOB anpassen).",
            instance,
        )


def jobs_dir_size_bytes() -> int:
    """Total size (bytes) of everything under ``JOB_BASE_DIR``; 0 if absent."""
    base = config.JOB_BASE_DIR
    if not base.exists():
        return 0
    total = 0
    for path in base.rglob("*"):
        try:
            if path.is_file():
                total += path.stat().st_size
        except OSError:
            # A file vanishing mid-walk (cleanup / another job) must not crash the
            # guard — skip it and keep summing.
            continue
    return total


def enforce_storage_limit(instance: str) -> None:
    """Refuse a new job once ``JOB_BASE_DIR`` holds ``MAX_JOBS_DISK_GB`` (0 = off)."""
    limit_gb = config.MAX_JOBS_DISK_GB
    if not limit_gb:
        return
    used = jobs_dir_size_bytes()
    limit_bytes = int(limit_gb * 1024 ** 3)
    if used >= limit_bytes:
        logger.warning(
            "Upload rejected: job storage %.1f GB >= limit %g GB",
            used / 1024 ** 3, limit_gb,
        )
        raise AppException(
            ErrorTypes.STORAGE_LIMIT_EXCEEDED,
            f"Der Job-Speicher ist ausgelastet "
            f"({used / 1024 ** 3:.1f} GB von {limit_gb:g} GB belegt). "
            f"Bitte alte Analysen löschen oder warten, bis sie ablaufen.",
            instance,
        )
