import os
import json
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, BackgroundTasks, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.errors.batch_errors import BatchException
# Importiere deinen R-Executor
from app.services.r_executor import run_r_script

router = APIRouter()

# Pfad zu deinen Jobs (Absolut auflösen für Docker-Sicherheit)
JOBS_DIR = Path("jobs").resolve()


# ── PYDANTIC MODELS (EXAKTER API-CONTRACT) ──────────────────────────────────

class BatchSettingsInner(BaseModel):
    batch_variable: str
    covariates: List[str] = []

class BatchSettingsPayload(BaseModel):
    """Erfüllt das Format: {"batch_correction": {"batch_variable": "...", "covariates": [...]}}"""
    batch_correction: BatchSettingsInner

class BatchRound(BaseModel):
    round: int
    type: str
    svd_plot: str
    settings_used: Optional[Dict[str, Any]] = None
    timestamp: str

class BatchHistoryResponse(BaseModel):
    job_id: str
    rounds: List[BatchRound]
    current_round: int
    correction_applied: bool

class BatchRunResponse(BaseModel):
    job_id: str
    status: str
    round: int

class BatchSkipResponse(BaseModel):
    job_id: str
    status: str


# ── HELPER FUNCTIONS ────────────────────────────────────────────────────────

def get_job_dir_or_404(job_id: str) -> Path:
    job_dir = JOBS_DIR / job_id
    if not job_dir.exists() or not job_dir.is_dir():
        raise BatchException(
            status_code=404, 
            error_code="JOB_NOT_FOUND", 
            message=f"Job '{job_id}' wurde nicht gefunden."
        )
    return job_dir

def load_history(job_dir: Path, job_id: str) -> dict:
    history_file = job_dir / "batch_history.json"
    
    if not history_file.exists():
        initial_history = {
            "job_id": job_id,
            "rounds": [
                {
                    "round": 1,
                    "type": "initial",
                    "svd_plot": f"/api/v1/batch/{job_id}/svd-plot/0",
                    "settings_used": None,
                    "timestamp": datetime.now().isoformat()
                }
            ],
            "current_round": 1,
            "correction_applied": False
        }
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(initial_history, f, indent=2)
        return initial_history

    with open(history_file, "r", encoding="utf-8") as f:
        return json.load(f)

def save_history(job_dir: Path, data: dict):
    history_file = job_dir / "batch_history.json"
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

def get_available_columns_from_samplesheet(job_dir: Path) -> list:
    """Mock-Logik: Spalten, die real in deinem Samplesheet stehen."""
    return ["Sample_Group", "Sentrix_ID", "Sentrix_Position", "Slide"]

def set_job_status(job_id: str, status_str: str, phase_str: Optional[str] = None):
    """
    Hier updatest du den globalen App-State/DB, 
    damit GET /status/{job_id} die korrekten Werte liefert.
    """
    print(f"[STATUS-UPDATE] Job {job_id} -> status: {status_str}, phase: {phase_str}", flush=True)


# ── ASYNC PIPELINE BACKGROUND WORKER ────────────────────────────────────────

async def run_batch_pipeline_task(job_id: str, settings_dict: dict, next_round: int, job_dir: Path):
    """
    Orchestriert die R-Skripte nacheinander im Hintergrund.
    Aktualisiert die Historie erst, wenn BEIDE Skripte erfolgreich waren.
    """
    try:
        # 1. Schritt: R-Korrektur ausführen (Erzeugt corrected_data.rds)
        print(f"[PIPELINE] Starte Batch-Korrektur für Job {job_id}...", flush=True)
        covariates_str = ",".join(settings_dict.get("covariates", []))
        
        correction_result = await run_r_script(
            script="batch_correct.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",  # Findet R-Skript selbstständig
            mode="batch_correction",
            script_args=[settings_dict["batch_variable"], covariates_str]
        )
        
        if correction_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] Batch-Korrektur für Job {job_id} fehlgeschlagen.", flush=True)
            set_job_status(job_id, status_str="failed")
            return

        # 2. Schritt: SVD-Plot für die korrigierten Daten generieren
        print(f"[PIPELINE] Generiere SVD-Plot für Runde {next_round}...", flush=True)
        plot_result = await run_r_script(
            script="generate_svd_plot.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="svd_plot",
            script_args=[
                "corrected_data.rds", 
                f"svd_plot_{next_round}.png", 
                settings_dict["batch_variable"]
            ]
        )
        
        if plot_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] SVD-Plot Generierung für Job {job_id} fehlgeschlagen.", flush=True)
            set_job_status(job_id, status_str="failed")
            return

        # 3. Schritt: Erst wenn alles erfolgreich war -> Historie laden, erweitern und speichern
        print(f"[PIPELINE] Beide R-Skripte erfolgreich. Aktualisiere Historie...", flush=True)
        history_data = load_history(job_dir, job_id)
        
        new_round_node = {
            "round": next_round,
            "type": "correction",
            "svd_plot": f"/api/v1/batch/{job_id}/svd-plot/{next_round}",
            "settings_used": settings_dict,
            "timestamp": datetime.now().isoformat()
        }
        
        history_data["rounds"].append(new_round_node)
        history_data["current_round"] = next_round
        history_data["correction_applied"] = True
        
        save_history(job_dir, history_data)
        
        # 4. Schritt: Globalen Status auf "batch_done" setzen -> Frontend zieht weiter
        set_job_status(job_id, status_str="batch_done")
        print(f"[PIPELINE SUCCESS] Workflow für Job {job_id} komplett abgeschlossen!", flush=True)

    except Exception as e:
        print(f"[PIPELINE CRITICAL] Unerwarteter Fehler im Ablauf: {str(e)}", flush=True)
        set_job_status(job_id, status_str="failed")


# ── ENDPOINTS ─────────────────────────────────────────────────────────────

@router.get("/{job_id}/history", response_model=BatchHistoryResponse)
def get_batch_history(job_id: str):
    job_dir = get_job_dir_or_404(job_id)
    
    # ── FÜR TESTS AUSKOMMENTIERT ──────────────────────────────────────────
    # global_status = get_global_job_status(job_id)
    # if global_status not in ("normalization_done", "batch_done"):
    #     raise BatchException(...)
    # ──────────────────────────────────────────────────────────────────────
    
    history_data = load_history(job_dir, job_id)
    return history_data


@router.get("/{job_id}/svd-plot/{round_id}")
def get_svd_plot(job_id: str, round_id: int):
    job_dir = get_job_dir_or_404(job_id)
    plot_file = job_dir / f"svd_plot_{round_id}.png"
    
    if not plot_file.exists():
        raise BatchException(
            status_code=404,
            error_code="PLOT_NOT_FOUND",
            message=f"SVD-Plot für Runde {round_id} wurde nicht gefunden."
        )
    
    return FileResponse(plot_file, media_type="image/png")


@router.post("/{job_id}", status_code=status.HTTP_202_ACCEPTED, response_model=BatchRunResponse)
def run_batch_correction(job_id: str, payload: BatchSettingsPayload, background_tasks: BackgroundTasks):
    job_dir = get_job_dir_or_404(job_id)
    settings = payload.batch_correction
    
    # 1. 409 BATCH_NOT_ALLOWED (Auskommentiert für deine Tests)
    # ...
    
    # 2. 409 SVD_PLOT_NOT_FOUND (Temporär für deine Tests auskommentiert)
    # if not (job_dir / "svd_plot_0.png").exists():
    #     raise BatchException(...)
        
    # 3. 400 INVALID_BATCH_VARIABLE
    available_cols = get_available_columns_from_samplesheet(job_dir)
    if settings.batch_variable not in available_cols:
        raise BatchException(
            status_code=400,
            error_code="INVALID_BATCH_VARIABLE",
            message=f"Spalte '{settings.batch_variable}' nicht im Samplesheet gefunden.",
            detail={"provided": settings.batch_variable, "available": available_cols}
        )
        
    # 4. 400 COVARIATE_EQUALS_BATCH
    if settings.batch_variable in settings.covariates:
        raise BatchException(
            status_code=400,
            error_code="COVARIATE_EQUALS_BATCH",
            message="Die Batch-Variable darf nicht gleichzeitig als Kovariable deklariert werden.",
            detail={"provided_batch_variable": settings.batch_variable, "provided_covariates": settings.covariates}
        )

    # 5. Historie laden NUR um die nächste Runden-Nummer für die Response zu bestimmen
    history_data = load_history(job_dir, job_id)
    next_round = history_data.get("current_round", 1) + 1
    
    # 6. Globalen Status auf "running" setzen, damit das Frontend die Progressbar anwirft
    set_job_status(job_id, status_str="running", phase_str="batch_correction")
    
    # 7. Die asynchrone Pipeline als Background-Task starten
    background_tasks.add_task(
        run_batch_pipeline_task, 
        job_id, 
        settings.model_dump(), 
        next_round, 
        job_dir
    )
    
    # Sofortige Rückmeldung an das Frontend (Status 202)
    return {
        "job_id": job_id,
        "status": "running",
        "round": next_round
    }


@router.post("/{job_id}/skip", status_code=status.HTTP_202_ACCEPTED, response_model=BatchSkipResponse)
def skip_batch_correction(job_id: str):
    get_job_dir_or_404(job_id)
    set_job_status(job_id, status_str="batch_done")
    return {
        "job_id": job_id,
        "status": "batch_done"
    }