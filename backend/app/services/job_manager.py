# app/services/job_manager.py
"""In-memory job registry and phase/status state machine.

Holds the live job records, the allowed-transition graph, and the cancel-event
and background-task registries used to drive and reset the pipeline.
"""
import asyncio
import logging
from enum import Enum
from typing import Dict, Optional, Any, Set, Tuple

from app.models.job import JobStatus
from app.core.exceptions import InvalidTransitionError, JobSessionExpiredError

logger = logging.getLogger(__name__)


# ── In-Memory Storage ────────────────────────────────────────────────────────
jobs:          Dict[str, JobStatus]    = {}
cancel_events: Dict[str, asyncio.Event] = {}
resetting_jobs: Set[str]               = set()  # jobs currently being reset
job_tasks:     Dict[str, asyncio.Task]  = {}     # active pipeline tasks (s. pipeline_task.py)


# ── Enums ────────────────────────────────────────────────────────────────────

class JobStatusValue(str, Enum):
    """Operational state of a job within a phase."""

    RUNNING   = "running"
    WAITING   = "waiting"
    COMPLETED = "completed"
    FAILED    = "failed"


class JobPhase(str, Enum):
    """Technical pipeline step a job is currently in."""

    UPLOADED              = "uploaded"
    FILTERING             = "filtering"
    NORMALIZATION_PREVIEW = "normalization_preview"
    NORMALIZATION         = "normalization"
    SVD                   = "svd"
    BATCH                 = "batch"
    ANALYSIS              = "analysis"
    RESULTS               = "results"
    HEATMAP               = "heatmap"


# ── Allowed transitions ──────────────────────────────────────────────────────
_ALLOWED_TRANSITIONS: Dict[
    Tuple[JobPhase, JobStatusValue],
    Set[Tuple[JobPhase, JobStatusValue]],
] = {
    # UPLOAD
    (JobPhase.UPLOADED, JobStatusValue.WAITING): {
        (JobPhase.UPLOADED,              JobStatusValue.COMPLETED),
        (JobPhase.UPLOADED,              JobStatusValue.FAILED),
    },
    (JobPhase.UPLOADED, JobStatusValue.COMPLETED): {
        (JobPhase.FILTERING,             JobStatusValue.RUNNING),
    },
    # FILTERING
    (JobPhase.FILTERING, JobStatusValue.RUNNING): {
        (JobPhase.FILTERING,             JobStatusValue.COMPLETED),
        (JobPhase.FILTERING,             JobStatusValue.FAILED),
    },
    (JobPhase.FILTERING, JobStatusValue.COMPLETED): {
        (JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.RUNNING),
    },
    # NORMALIZATION_PREVIEW
    (JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.RUNNING): {
        (JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.COMPLETED),
        (JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.FAILED),
    },
    (JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.COMPLETED): {
        (JobPhase.NORMALIZATION,         JobStatusValue.WAITING),
    },
    # NORMALIZATION
    (JobPhase.NORMALIZATION, JobStatusValue.WAITING): {
        (JobPhase.NORMALIZATION,         JobStatusValue.RUNNING),
    },
    (JobPhase.NORMALIZATION, JobStatusValue.RUNNING): {
        (JobPhase.NORMALIZATION,         JobStatusValue.COMPLETED),
        (JobPhase.NORMALIZATION,         JobStatusValue.FAILED),
    },
    (JobPhase.NORMALIZATION, JobStatusValue.FAILED): {
        (JobPhase.NORMALIZATION,         JobStatusValue.RUNNING),
    },
    (JobPhase.NORMALIZATION, JobStatusValue.COMPLETED): {
        (JobPhase.SVD,                   JobStatusValue.RUNNING),
    },
    # SVD
    (JobPhase.SVD, JobStatusValue.RUNNING): {
        (JobPhase.SVD,                   JobStatusValue.COMPLETED),
        (JobPhase.SVD,                   JobStatusValue.FAILED),
    },
    (JobPhase.SVD, JobStatusValue.COMPLETED): {
        (JobPhase.BATCH,                 JobStatusValue.WAITING),
    },
    # BATCH
    (JobPhase.BATCH, JobStatusValue.WAITING): {
        (JobPhase.BATCH,                 JobStatusValue.RUNNING),
        (JobPhase.ANALYSIS,              JobStatusValue.RUNNING),
    },
    (JobPhase.BATCH, JobStatusValue.RUNNING): {
        (JobPhase.BATCH,                 JobStatusValue.COMPLETED),
        (JobPhase.BATCH,                 JobStatusValue.FAILED),
    },
    (JobPhase.BATCH, JobStatusValue.FAILED): {
        (JobPhase.BATCH,                 JobStatusValue.RUNNING),
    },
    (JobPhase.BATCH, JobStatusValue.COMPLETED): {
        (JobPhase.SVD,                   JobStatusValue.RUNNING),
    },
    # ANALYSIS
    (JobPhase.ANALYSIS, JobStatusValue.RUNNING): {
        (JobPhase.ANALYSIS,              JobStatusValue.COMPLETED),
        (JobPhase.ANALYSIS,              JobStatusValue.FAILED),
    },
    (JobPhase.ANALYSIS, JobStatusValue.COMPLETED): {
        (JobPhase.RESULTS,               JobStatusValue.WAITING),
    },
    # RESULTS
    (JobPhase.RESULTS, JobStatusValue.WAITING): {
        (JobPhase.RESULTS,               JobStatusValue.COMPLETED),
        (JobPhase.RESULTS,               JobStatusValue.FAILED),
        (JobPhase.HEATMAP,               JobStatusValue.RUNNING),
    },
    (JobPhase.RESULTS, JobStatusValue.COMPLETED): {
        (JobPhase.RESULTS,               JobStatusValue.WAITING),
    },
    # HEATMAP
    (JobPhase.HEATMAP, JobStatusValue.RUNNING): {
        (JobPhase.HEATMAP,               JobStatusValue.COMPLETED),
        (JobPhase.HEATMAP,               JobStatusValue.FAILED),
    },
    (JobPhase.HEATMAP, JobStatusValue.FAILED): {
        (JobPhase.HEATMAP,               JobStatusValue.RUNNING),
        (JobPhase.RESULTS,               JobStatusValue.WAITING),
    },
    (JobPhase.HEATMAP, JobStatusValue.COMPLETED): {
        (JobPhase.RESULTS,               JobStatusValue.WAITING),
    },
}


# ── Core API ─────────────────────────────────────────────────────────────────

def create_job(job_id: str) -> JobStatus:
    """Register a new job in the UPLOADED/WAITING state and return it."""
    job = JobStatus(
        job_id=job_id,
        status=JobStatusValue.WAITING.value,
        phase=JobPhase.UPLOADED.value,
        progress_percent=0,
        current_step="Files uploaded, waiting for processing...",
        error=None,
    )
    jobs[job_id] = job
    return job


def transition_job(
    job_id: str,
    new_phase: JobPhase,
    new_status: JobStatusValue,
    *,
    progress_percent: Optional[int] = None,
    current_step: Optional[str] = None,
    error: Optional[Dict[str, Any]] = None,
) -> Optional[JobStatus]:
    """Move a job to a new phase/status, enforcing the allowed-transition graph.

    Args:
        job_id: The job to transition.
        new_phase: The target pipeline phase.
        new_status: The target status within that phase.
        progress_percent: New progress value, if it should change.
        current_step: New human-readable status line, if it should change.
        error: Problem body to attach when transitioning to FAILED.

    Returns:
        The updated job, or ``None`` if the job is currently being reset (the
        transition is then silently dropped).

    Raises:
        JobSessionExpiredError: If the in-memory job session no longer exists.
        InvalidTransitionError: If the transition is not allowed from the
            current state.
    """
    # Reset takes precedence over any transition. While a job is being reset
    # its background task may still emit trailing transitions until it observes
    # the cancel event — these are expected and silently dropped instead of
    # raising or mutating a job that is about to disappear.
    if job_id in resetting_jobs:
        logger.debug("[transition_job] Skipped, job is being reset: job_id=%s", job_id)
        return None

    job = jobs.get(job_id)
    if job is None:
        # The in-memory session is gone (backend restart / eviction) while a
        # request still targets this job. Raise a typed AppException so the
        # caller gets a clean RFC 9457 410 response instead of a raw 500.
        raise JobSessionExpiredError(job_id)

    current = (JobPhase(job.phase), JobStatusValue(job.status))
    target  = (new_phase, new_status)
    allowed = _ALLOWED_TRANSITIONS.get(current, set())

    if target not in allowed:
        msg = (
            f"[transition_job] Invalid transition for job '{job_id}': "
            f"({current[0].value}, {current[1].value}) → "
            f"({new_phase.value}, {new_status.value}). "
            f"Allowed: {[(p.value, s.value) for p, s in allowed]}"
        )
        logger.error(msg)
        raise InvalidTransitionError(job_id=job_id, message=msg)

    logger.info(
        "[transition_job] Job '%s': (%s, %s) → (%s, %s)",
        job_id,
        current[0].value, current[1].value,
        new_phase.value,  new_status.value,
    )

    job.phase  = new_phase.value
    job.status = new_status.value
    if progress_percent is not None:
        job.progress_percent = progress_percent
    if current_step is not None:
        job.current_step = current_step
    if new_status == JobStatusValue.FAILED:
        if error is not None:
            job.error = error
    else:
        job.error = None

    jobs[job_id] = job
    return job


def set_progress(job_id: str, percent: int, message: str) -> Optional[JobStatus]:
    """Update a running job's progress and status line.

    Returns the updated job, or ``None`` if the job is unknown or being reset
    (progress updates are dropped during a reset; see :func:`transition_job`).
    """
    if job_id in resetting_jobs:
        return None
    job = jobs.get(job_id)
    if job is None:
        return None
    job.progress_percent = percent
    job.current_step     = message
    job.status           = JobStatusValue.RUNNING.value
    jobs[job_id] = job
    return job


def get_job(job_id: str) -> Optional[JobStatus]:
    """Return the job with the given id, or ``None`` if it is unknown."""
    return jobs.get(job_id)


def delete_job(job_id: str) -> bool:
    """Remove a job from the registry. Return True if it existed."""
    if job_id in jobs:
        del jobs[job_id]
        return True
    return False


# ── Cancel-event tracking ────────────────────────────────────────────────────

def register_cancel_event(job_id: str, event: asyncio.Event) -> None:
    """Register the cancel event for a running job."""
    cancel_events[job_id] = event


def unregister_cancel_event(job_id: str) -> None:
    """Remove a job's cancel event once the job has finished."""
    cancel_events.pop(job_id, None)


def get_cancel_event(job_id: str) -> Optional[asyncio.Event]:
    """Return a job's cancel event if one is registered (e.g. for sub-services)."""
    return cancel_events.get(job_id)


def trigger_cancel(job_id: str) -> bool:
    """Set a job's cancel event (e.g. from the reset endpoint).

    Returns True if an active, unset event was found and signalled.
    """
    event = cancel_events.get(job_id)
    if event and not event.is_set():
        event.set()
        logger.info("[trigger_cancel] Cancel event set: job_id=%s", job_id)
        return True
    return False


# ── Background-task registry ─────────────────────────────────────────────────
# Companion to the cancel-event registry: holds the asyncio.Task reference itself
# so pipeline_task.py (and a potential future shutdown routine) knows which
# pipeline tasks are currently active for a job. Populated exclusively by
# pipeline_task.start_job_pipeline() — services do not call it directly (see
# r_executor_spec.md section 6, rule 3).

def register_job_task(job_id: str, task: asyncio.Task) -> None:
    """Register the active pipeline task for a job."""
    job_tasks[job_id] = task


def unregister_job_task(job_id: str) -> None:
    """Remove a job's pipeline task reference once it has finished."""
    job_tasks.pop(job_id, None)


def get_job_task(job_id: str) -> Optional[asyncio.Task]:
    """Return a job's active pipeline task, or ``None`` if there is none."""
    return job_tasks.get(job_id)


# ── Reset-Lifecycle ──────────────────────────────────────────────────────────
# A job is added to `resetting_jobs` for the whole duration of a reset. This
# both serializes concurrent resets of the same job and turns any trailing
# transition_job/set_progress call into a silent no-op (see those functions).

def begin_reset(job_id: str) -> bool:
    """Claim the reset slot for a job, returning False if one is already active.

    No lock needed: the event loop is single-threaded and there is no await
    between the membership test and the insert, so this is atomic.
    """
    if job_id in resetting_jobs:
        return False
    resetting_jobs.add(job_id)
    return True


def end_reset(job_id: str) -> None:
    """Release the reset slot. Safe to call even if no reset was active."""
    resetting_jobs.discard(job_id)


def is_resetting(job_id: str) -> bool:
    """Return True if a reset is currently in progress for the job."""
    return job_id in resetting_jobs