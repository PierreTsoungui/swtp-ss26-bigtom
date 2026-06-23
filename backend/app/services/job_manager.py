# app/services/job_manager.py
import asyncio
import logging
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, Optional, Any, Set, Tuple

from app.models.job import JobStatus
from app.core.exceptions import InvalidTransitionError

logger = logging.getLogger(__name__)


# ── In-Memory Storage ────────────────────────────────────────────────────────
jobs:          Dict[str, JobStatus]    = {}
cancel_events: Dict[str, asyncio.Event] = {}
resetting_jobs: Set[str]               = set()  # jobs currently being reset
job_tasks:     Dict[str, asyncio.Task]  = {}     # active pipeline tasks (s. pipeline_task.py)


# ── Enums ────────────────────────────────────────────────────────────────────

class JobStatusValue(str, Enum):
    """Betriebszustand eines Jobs innerhalb einer Phase."""
    RUNNING   = "running"
    WAITING   = "waiting"
    COMPLETED = "completed"
    FAILED    = "failed"


class JobPhase(str, Enum):
    """Technischer Pipeline-Schritt."""
    UPLOADED              = "uploaded"
    FILTERING             = "filtering"
    NORMALIZATION_PREVIEW = "normalization_preview"
    NORMALIZATION         = "normalization"
    SVD                   = "svd"
    BATCH                 = "batch"
    ANALYSIS              = "analysis"
    RESULTS               = "results"
    HEATMAP               = "heatmap"


# ── Erlaubte Übergänge ───────────────────────────────────────────────────────
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


# ── Kern-API ─────────────────────────────────────────────────────────────────

def create_job(job_id: str) -> JobStatus:
    job = JobStatus(
        job_id=job_id,
        status=JobStatusValue.WAITING.value,
        phase=JobPhase.UPLOADED.value,
        progress_percent=0,
        current_step="Dateien hochgeladen, warte auf Verarbeitung...",
        error=None,
    )
    jobs[job_id] = job
    return job


def transition_job(
    job_id: str,
    new_phase: JobPhase,
    new_status: JobStatusValue,
    *,
    progress_percent: int = None,
    current_step: str = None,
    error: Dict[str, Any] = None,
) -> JobStatus:
    # Reset takes precedence over any transition. While a job is being reset
    # its background task may still emit trailing transitions until it observes
    # the cancel event — these are expected and silently dropped instead of
    # raising or mutating a job that is about to disappear.
    if job_id in resetting_jobs:
        logger.debug("[transition_job] Skipped, job is being reset: job_id=%s", job_id)
        return None

    job = jobs.get(job_id)
    if job is None:
        raise KeyError(f"Job '{job_id}' nicht gefunden.")

    current = (JobPhase(job.phase), JobStatusValue(job.status))
    target  = (new_phase, new_status)
    allowed = _ALLOWED_TRANSITIONS.get(current, set())

    if target not in allowed:
        msg = (
            f"[transition_job] Ungültiger Übergang für Job '{job_id}': "
            f"({current[0].value}, {current[1].value}) → "
            f"({new_phase.value}, {new_status.value}). "
            f"Erlaubt: {[(p.value, s.value) for p, s in allowed]}"
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
    # Drop progress updates for jobs that are being reset (see transition_job).
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
    return jobs.get(job_id)


def delete_job(job_id: str) -> bool:
    if job_id in jobs:
        del jobs[job_id]
        return True
    return False


# ── Cancel-Event-Tracking (für den neuen Command-basierten Executor) ─────────

def register_cancel_event(job_id: str, event: asyncio.Event) -> None:
    """Registriert das Abbruch-Event für einen laufenden Job."""
    cancel_events[job_id] = event


def unregister_cancel_event(job_id: str) -> None:
    """Entfernt das Cancel-Event nach Abschluss des Jobs."""
    cancel_events.pop(job_id, None)


def get_cancel_event(job_id: str) -> Optional[asyncio.Event]:
    """Gibt das Cancel-Event zurück, falls vorhanden (z.B. für Sub-Services)."""
    return cancel_events.get(job_id)


def trigger_cancel(job_id: str) -> bool:
    """
    Setzt das Cancel-Event des Jobs (z.B. vom Reset-Endpunkt).
    Gibt True zurück wenn ein aktives Event gefunden und gesetzt wurde.
    """
    event = cancel_events.get(job_id)
    if event and not event.is_set():
        event.set()
        logger.info("[trigger_cancel] Cancel-Event gesetzt: job_id=%s", job_id)
        return True
    return False


# ── Background-Task-Registry ─────────────────────────────────────────────────
# Ergänzung zur Cancel-Event-Registry: hält die asyncio.Task-Referenz selbst,
# damit pipeline_task.py (und potenziell eine künftige Shutdown-Routine) weiß,
# welche Pipeline-Tasks gerade für einen Job aktiv sind. Wird ausschließlich
# von pipeline_task.start_job_pipeline() befüllt — Services rufen das nicht
# direkt auf (siehe r_executor_spec.md Abschnitt 6, Regel 3).

def register_job_task(job_id: str, task: asyncio.Task) -> None:
    job_tasks[job_id] = task


def unregister_job_task(job_id: str) -> None:
    job_tasks.pop(job_id, None)


def get_job_task(job_id: str) -> Optional[asyncio.Task]:
    return job_tasks.get(job_id)


# ── Reset-Lifecycle ──────────────────────────────────────────────────────────
# A job is added to `resetting_jobs` for the whole duration of a reset. This
# both serializes concurrent resets of the same job and turns any trailing
# transition_job/set_progress call into a silent no-op (see those functions).

def begin_reset(job_id: str) -> bool:
    """Claim the reset slot for a job. Returns False if a reset is already
    active for it.

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
    return job_id in resetting_jobs