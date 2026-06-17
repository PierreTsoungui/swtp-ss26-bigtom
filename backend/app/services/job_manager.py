# app/services/job_manager.py
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, Optional, Any, Set, Tuple
from app.models.job import JobStatus
from app.core.exceptions import InvalidTransitionError
import asyncio
import logging

logger = logging.getLogger(__name__)

# ── In-Memory Storage ────────────────────────────────────────────────────────
jobs: Dict[str, JobStatus] = {}
running_processes: Dict[str, asyncio.subprocess.Process] = {}


# ── Enums ────────────────────────────────────────────────────────────────────

class JobStatusValue(str, Enum):
    """Betriebszustand eines Jobs innerhalb einer Phase."""
    RUNNING   = "running"   # R-Skript läuft aktiv
    WAITING   = "waiting"   # Wartet auf Userinput (IDLE im Zustandsautomaten)
    COMPLETED = "completed" # Phase erfolgreich abgeschlossen
    FAILED    = "failed"    # Fehler innerhalb der Phase


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
    Set[Tuple[JobPhase, JobStatusValue]]
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
        (JobPhase.NORMALIZATION,         JobStatusValue.RUNNING),  # Retry mit anderer Methode
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
        (JobPhase.ANALYSIS,              JobStatusValue.RUNNING),  # User überspringt Batch
    },
    (JobPhase.BATCH, JobStatusValue.RUNNING): {
        (JobPhase.BATCH,                 JobStatusValue.COMPLETED),
        (JobPhase.BATCH,                 JobStatusValue.FAILED),
    },
    (JobPhase.BATCH, JobStatusValue.FAILED): {
        (JobPhase.BATCH,                 JobStatusValue.RUNNING),  # Retry mit anderen Einstellungen
    },
    (JobPhase.BATCH, JobStatusValue.COMPLETED): {
        (JobPhase.SVD,                   JobStatusValue.RUNNING),  # Neuer SVD nach Korrektur
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
        (JobPhase.HEATMAP,               JobStatusValue.RUNNING),  # Guard: TableTab == DMP (FE)
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
        (JobPhase.HEATMAP,               JobStatusValue.RUNNING),  # Retry mit anderen Filtern/Gruppierung
        (JobPhase.RESULTS,               JobStatusValue.WAITING),  # User bricht ab, zurück zur Tabelle
    },
    (JobPhase.HEATMAP, JobStatusValue.COMPLETED): {
        (JobPhase.RESULTS,               JobStatusValue.WAITING),
    },
}


# ── Kern-API ─────────────────────────────────────────────────────────────────

def create_job(job_id: str) -> JobStatus:
    """Erstellt einen neuen Job im Initialzustand (uploaded, waiting)."""
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
    """
    Führt einen validierten Zustandsübergang durch.
    Wirft InvalidTransitionError bei ungültigem Übergang.
    Alle Phasen- und Statuswechsel laufen ausschließlich über diese Funktion.
    """
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


def set_progress(
    job_id: str,
    percent: int,
    message: str,
) -> Optional[JobStatus]:
    """
    Aktualisiert ausschließlich Fortschrittsfelder eines laufenden Jobs.
    Kein Phasenwechsel — nur für progress-Events aus dem R-Executor.
    """
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


# ── Process-Tracking ─────────────────────────────────────────────────────────

def register_process(job_id: str, process: asyncio.subprocess.Process) -> None:
    running_processes[job_id] = process


def unregister_process(job_id: str) -> None:
    running_processes.pop(job_id, None)


async def kill_process(job_id: str) -> bool:
    process = running_processes.get(job_id)
    if process and process.returncode is None:
        process.kill()
        await process.wait()
        unregister_process(job_id)
        return True
    return False