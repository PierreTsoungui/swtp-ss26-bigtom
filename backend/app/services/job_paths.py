"""Central job-directory resolution shared by every service.

One ``JOBS_DIR`` (derived from the centrally configured ``JOB_BASE_DIR``) and one
``get_job_dir_or_404`` so that every route and service resolves and validates a
job's directory the same way, instead of re-deriving the base path and the
"not found" error in each module.
"""
import re
from pathlib import Path

from app.core.config import JOB_BASE_DIR
from app.core.error_types import AppException, ErrorTypes

# Absolute base directory that holds one sub-directory per job. Resolved once so
# every consumer agrees on the same location regardless of the process CWD.
JOBS_DIR: Path = JOB_BASE_DIR.resolve()

# A job id is only ever used to build ``JOBS_DIR / job_id``, so it must be a
# single safe path segment. Production ids are UUIDs (see upload/commit), but the
# guard is intentionally scheme-agnostic: it forbids path separators, ``.`` (and
# therefore ``..``) and any other surprising character, which is what actually
# stops path traversal — without pinning the id to one format.
_SAFE_JOB_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def validate_job_id(job_id: str) -> str:
    """Return ``job_id`` if it is a safe path segment, else raise 404.

    Defense-in-depth against path traversal (``../``); call it at the entrance of
    every endpoint that maps a client-supplied id onto the filesystem.
    """
    if not isinstance(job_id, str) or not _SAFE_JOB_ID.match(job_id):
        raise AppException(
            ErrorTypes.JOB_NOT_FOUND,
            detail=f"Invalid job id: {job_id!r}",
        )
    return job_id


def resolve_job_dir(base_dir: Path, job_id: str) -> Path:
    """Return ``base_dir/job_id`` or raise ``AppException(JOB_NOT_FOUND)``.

    Validates the id first (traversal guard), then confirms the directory exists.
    Takes the base directory explicitly so callers that expose a patchable
    module-level ``JOBS_DIR`` (for tests) keep full control over the lookup root.
    """
    validate_job_id(job_id)
    job_dir = base_dir / job_id
    if not job_dir.exists() or not job_dir.is_dir():
        raise AppException(
            ErrorTypes.JOB_NOT_FOUND,
            detail=f"Job '{job_id}' was not found.",
        )
    return job_dir


def get_job_dir_or_404(job_id: str) -> Path:
    """Return the job's directory under the canonical ``JOBS_DIR`` or raise 404."""
    return resolve_job_dir(JOBS_DIR, job_id)
