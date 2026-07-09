"""Intake guards shared by every upload path.

Reject a job before any work starts when it would blow the deployment budget:
  * too many samples for the RAM budget (peak memory scales with sample count),
  * the job storage area is already full (accounting cap), or
  * the volume has too little free space to accept the upload.

This module also maps a disk-write failure that slips past the guards into a
structured error (:func:`storage_error`), so a full disk never surfaces as a raw
500 traceback.

Limits come from :mod:`app.core.config` (env-configurable, 0 = disabled). The
container ``mem_limit`` / disk are the hard backstops; these guards turn a
would-be mid-pipeline OOM or a full disk into a clear, early error message.
"""

import errno
import logging
import shutil

from app.core import config
from app.core.error_types import AppException, ErrorTypes

logger = logging.getLogger(__name__)


def storage_error(exc: OSError, instance: str | None = None) -> AppException:
    """Map a disk-write ``OSError`` to the appropriate structured ``AppException``.

    A full volume (``ENOSPC``) is a client-actionable ``507`` ("free up space and
    retry"); any other write failure is an internal ``500``. Callers raise the
    result so a failed write becomes an RFC 9457 response instead of a bare 500
    traceback.
    """
    if exc.errno == errno.ENOSPC:
        return AppException(
            ErrorTypes.STORAGE_LIMIT_EXCEEDED,
            "The server ran out of disk space while storing the upload. "
            "Please delete old analyses or wait until they expire, then try again.",
            instance,
        )
    return AppException(
        ErrorTypes.SAVE_FAILED,
        f"The upload could not be written to disk: {exc}",
        instance,
    )


def enforce_free_disk_space(instance: str | None = None) -> None:
    """Refuse an upload when the storage volume has less than ``MIN_FREE_DISK_MB`` free.

    Checks the filesystem's actual free space (so it also catches a disk filled
    by anything else on the volume), and is a no-op when the limit is 0 or the
    free space cannot be measured — the streaming writer degrades a genuinely
    full disk into a structured 507 regardless.
    """
    floor_mb = config.MIN_FREE_DISK_MB
    if not floor_mb:
        return

    base = config.STAGING_BASE_DIR
    probe = base if base.exists() else base.parent
    try:
        free = shutil.disk_usage(probe).free
    except OSError:
        return  # cannot determine free space; do not block on a measurement failure

    if free < floor_mb * 1024 ** 2:
        logger.warning(
            "Upload rejected: only %.0f MB free (< floor %d MB)",
            free / 1024 ** 2, floor_mb,
        )
        raise AppException(
            ErrorTypes.STORAGE_LIMIT_EXCEEDED,
            f"The server is low on disk space ({free / 1024 ** 2:.0f} MB free). "
            "Please delete old analyses or wait until they expire, then try again.",
            instance,
        )


def enforce_sample_limit(n_samples: int, instance: str) -> None:
    """Reject cohorts larger than ``MAX_SAMPLES_PER_JOB`` (0 = unlimited)."""
    limit = config.MAX_SAMPLES_PER_JOB
    if limit and n_samples > limit:
        logger.warning("Upload rejected: %d samples exceeds limit %d", n_samples, limit)
        raise AppException(
            ErrorTypes.TOO_MANY_SAMPLES,
            f"This analysis contains {n_samples} samples, but the limit is {limit}. "
            f"Please select fewer samples (or adjust MAX_SAMPLES_PER_JOB).",
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
            f"The job storage is full "
            f"({used / 1024 ** 3:.1f} GB of {limit_gb:g} GB used). "
            f"Please delete old analyses or wait until they expire.",
            instance,
        )
