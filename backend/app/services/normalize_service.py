# app/services/normalize_service.py
import asyncio
import logging
import os
import shutil
from pathlib import Path

from app.services.job_manager import transition_job, set_progress, JobPhase, JobStatusValue
from app.services.r_executor import run_r_script, NormalizationCommand, BatchInitCommand
from app.services.batch_service import find_sample_sheet_name

logger = logging.getLogger(__name__)

JOBS_DIR = Path("jobs").resolve()


async def run_normalization_pipeline(
    job_id: str,
    job_dir_id: str,
    method: str,
    cancel_event: asyncio.Event,
) -> None:
    """
    Orchestriert Normalisierung + SVD-Plot (Runde 0).

    Wird ausschließlich über pipeline_task.run_job_pipeline() gestartet.
    Kein cancel_event erzeugen, kein unregister hier.
    transition_job zu NORMALIZATION+RUNNING erfolgt bereits in der Route.
    """
    job_dir = str(JOBS_DIR / job_dir_id)

    # ── Schritt 1: Normalisierung ─────────────────────────────────────────────
    # FIX: _run_normalization_step liefert jetzt explizit zurück, ob dieser
    # Lauf erfolgreich war, statt dass der Aufrufer danach den globalen
    # Job-Status errät (job.status == FAILED). Letzteres war false-positiv-
    # anfällig: ein FAILED-Status, der aus einem ganz anderen Kontext stammt
    # (Race, vorheriger Lauf), hätte den SVD-Schritt fälschlich überspringen
    # können, selbst wenn Schritt 1 gerade frisch erfolgreich durchlief.
    step_succeeded = await _run_normalization_step(job_id, job_dir, method, cancel_event)

    if cancel_event.is_set():
        logger.info("Normalization cancelled after step 1: job_id=%s", job_id)
        return

    if not step_succeeded:
        # _run_normalization_step hat bereits die passende FAILED-Transition
        # gesetzt — hier nur noch abbrechen, kein erneutes transition_job nötig.
        return

    # ── Schritt 2: SVD-Plot Runde 0 ───────────────────────────────────────────
    await _run_svd_step(job_id, job_dir, cancel_event)


async def _run_normalization_step(
    job_id: str,
    job_dir: str,
    method: str,
    cancel_event: asyncio.Event,
) -> bool:
    """
    Führt normalize.R aus oder kopiert bei method='raw' die Rohdaten.

    Rückgabewert: True, wenn die Phase erfolgreich auf NORMALIZATION+COMPLETED
    transitioniert wurde. False bei Cancellation, Timeout oder Fehler — die
    passende Transition (FAILED, oder gar keine bei Cancellation) wurde dann
    bereits innerhalb dieser Funktion gesetzt.
    """
    if method == "raw":
        return await _copy_raw_data(job_id, job_dir)

    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            set_progress(
                job_id,
                percent=data.get("percent", data.get("progress_percent", 0)),
                message=data.get("message", data.get("current_step", "")),
            )

    result = await run_r_script(
        command=NormalizationCommand(
            script="normalize.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            extra_args=[method],
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    if result.is_cancelled:
        logger.info("Normalization R-script cancelled: job_id=%s", job_id)
        return False

    if result.is_timeout:
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler: normalize.R hat das Zeitlimit überschritten.",
            error={"detail": "Normalization timeout."},
        )
        return False

    if not result.is_success:
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler während der Normalisierung.",
            error={"detail": result.stderr or "normalize.R mit Fehlercode beendet."},
        )
        return False

    transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Normalisierung abgeschlossen.",
    )
    return True


async def _copy_raw_data(job_id: str, job_dir: str) -> bool:
    """Sonderfall method='raw': filtered_data.rds → normalized_data.rds."""
    set_progress(job_id, percent=0, message="Kopiere gefilterte Rohdaten...")

    filtered   = os.path.join(job_dir, "filtered_data.rds")
    normalized = os.path.join(job_dir, "normalized_data.rds")

    if not os.path.exists(filtered):
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler: filtered_data.rds nicht gefunden.",
            error={"detail": f"filtered_data.rds nicht gefunden in {job_dir}"},
        )
        return False

    shutil.copyfile(filtered, normalized)
    set_progress(job_id, percent=100, message="Rohdaten bereitgestellt.")

    transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Normalisierung abgeschlossen.",
    )
    return True


async def _run_svd_step(
    job_id: str,
    job_dir: str,
    cancel_event: asyncio.Event,
) -> None:
    """Erzeugt SVD-Plot Runde 0 nach erfolgreicher Normalisierung."""

    transition_job(
        job_id,
        new_phase=JobPhase.SVD,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step="Starte SVD-Plot-Generierung (Runde 0)...",
    )

    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            set_progress(
                job_id,
                percent=data.get("percent", data.get("progress_percent", 0)),
                message=f"SVD (Runde 0): {data.get('message', data.get('current_step', ''))}",
            )

    try:
        sample_sheet_name = find_sample_sheet_name(job_dir)
    except Exception:
        sample_sheet_name = "SampleSheet.csv"

    result = await run_r_script(
        command=BatchInitCommand(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            beta_file="normalized_data.rds",
            sample_sheet_file=sample_sheet_name,
            plot_name="svd_plot_0.png",
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    if result.is_cancelled:
        logger.info("SVD plot cancelled: job_id=%s", job_id)
        return

    if result.is_timeout:
        transition_job(
            job_id,
            new_phase=JobPhase.SVD,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler: batch_svd.R hat das Zeitlimit überschritten.",
            error={"detail": "SVD plot timeout."},
        )
        return

    if not result.is_success:
        transition_job(
            job_id,
            new_phase=JobPhase.SVD,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler bei SVD-Plot-Generierung (Runde 0).",
            error={"detail": result.stderr or "batch_svd.R mit Fehlercode beendet."},
        )
        return

    transition_job(
        job_id,
        new_phase=JobPhase.SVD,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="SVD-Plot (Runde 0) erfolgreich generiert.",
    )
    transition_job(
        job_id,
        new_phase=JobPhase.BATCH,
        new_status=JobStatusValue.WAITING,
        current_step="Bereit für Batch-Effekt-Korrektur.",
    )