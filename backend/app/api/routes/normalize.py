# app/api/routes/normalize.py
import os
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request

from app.core.error_types import ErrorTypes, problem_detail
from app.models.job import NormalizeRequest, NormalizeResponse
from app.services.job_manager import (
    get_job, transition_job, set_progress,
    JobPhase, JobStatusValue,
)
from app.services.r_executor import run_r_script
from app.services.batch_service import find_sample_sheet_name

router = APIRouter()

JOBS_DIR   = Path("jobs").resolve()
VALID_METHODS = {"noob", "quantile", "swan", "funnorm", "raw"}


# ── Endpunkt ──────────────────────────────────────────────────────────────────

@router.post("/normalize/{job_id}", response_model=NormalizeResponse, status_code=202)
async def start_normalization(
    request: Request,
    background_tasks: BackgroundTasks,
    job_id: str,
    body: NormalizeRequest,
):
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

    method = body.method.lower()
    if method not in VALID_METHODS:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.INVALID_NORMALIZATION_METHOD,
                detail=f"Ungültige Methode '{body.method}'. Erlaubt: {', '.join(VALID_METHODS)}",
                instance=request.url.path,
                job_id=job_id,
                provided_method=body.method,
                allowed_methods=list(VALID_METHODS),
            ),
        )

    # IDLE → RUNNING
    transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step=f"Starte Normalisierung mit Methode '{method}'...",
    )

    job_dir = str(JOBS_DIR / job_id)
    background_tasks.add_task(_run_normalization_background, job_id, job_dir, method)

    return NormalizeResponse(job_id=job_id, status=JobStatusValue.RUNNING.value, method=method)


# ── Hintergrund-Task ──────────────────────────────────────────────────────────

async def _run_normalization_background(job_id: str, job_dir: str, method: str) -> None:
    """Führt Normalisierung und anschließende SVD-Plot-Erzeugung (Runde 0) aus."""
    try:
        # Schritt 1: Normalisierung
        if method == "raw":
            set_progress(job_id, percent=0, message="Kopiere gefilterte Rohdaten...")
            filtered   = os.path.join(job_dir, "filtered_data.rds")
            normalized = os.path.join(job_dir, "normalized_data.rds")
            if not os.path.exists(filtered):
                raise FileNotFoundError(f"filtered_data.rds nicht gefunden: {filtered}")
            shutil.copyfile(filtered, normalized)
            set_progress(job_id, percent=100, message="Rohdaten bereitgestellt.")
        else:
            async def on_norm_progress(data: dict) -> None:
                if data.get("type") == "progress":
                    set_progress(job_id, percent=data["percent"], message=data["message"])

            result = await run_r_script(
                script="normalize.R",
                job_id=job_id,
                job_dir=job_dir,
                sample_sheet="",
                mode="normalization",
                script_args=[method],
                on_progress=on_norm_progress,
            )
            if result["returncode"] != 0:
                transition_job(
                    job_id,
                    new_phase=JobPhase.NORMALIZATION,
                    new_status=JobStatusValue.FAILED,
                    current_step="Fehler während der Normalisierung.",
                    error={"detail": result.get("stderr", "normalize.R mit Fehlercode beendet.")},
                )
                return

        # Normalisierung abgeschlossen
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Normalisierung abgeschlossen.",
        )

        # Schritt 2: SVD-Plot (Runde 0)
        transition_job(
            job_id,
            new_phase=JobPhase.SVD,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step="Starte SVD-Plot-Generierung (Runde 0)...",
        )

        async def on_svd_progress(data: dict) -> None:
            if data.get("type") == "progress":
                set_progress(
                    job_id,
                    percent=data["percent"],
                    message=f"SVD (Runde 0): {data['message']}",
                )

        try:
            sample_sheet_name = find_sample_sheet_name(job_dir)
        except Exception:
            sample_sheet_name = "SampleSheet.csv"

        svd_result = await run_r_script(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            mode="batch_init",
            script_args=["normalized_data.rds", sample_sheet_name, "svd_plot_0.png"],
            on_progress=on_svd_progress,
        )

        if svd_result["returncode"] != 0:
            transition_job(
                job_id,
                new_phase=JobPhase.SVD,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler bei SVD-Plot-Generierung (Runde 0).",
                error={"detail": svd_result.get("stderr", "batch_svd.R mit Fehlercode beendet.")},
            )
            return

        # SVD abgeschlossen → Batch-Phase öffnen
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

    except Exception as e:
        print(f"[NORMALIZE] Job {job_id}: Kritischer Fehler — {e}", flush=True)
        job = get_job(job_id)
        current_phase = JobPhase(job.phase) if job else JobPhase.NORMALIZATION
        transition_job(
            job_id,
            new_phase=current_phase,
            new_status=JobStatusValue.FAILED,
            current_step=f"Kritischer Systemfehler: {e}",
            error={"detail": str(e)},
        )