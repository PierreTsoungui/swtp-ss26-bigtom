# app/services/batch_service.py
import json
from datetime import datetime
from pathlib import Path
import subprocess
import glob
import os
from typing import Optional

from app.core.error_types import BatchException, ErrorTypes
from app.services.r_executor import run_r_script
from app.services import job_manager

JOBS_DIR = Path("jobs").resolve()

def get_job_dir_or_404(job_id: str) -> Path:
    job_dir = JOBS_DIR / job_id
    if not job_dir.exists() or not job_dir.is_dir():
        # Aktualisiert auf das neue Error-Format:
        raise BatchException(
            ErrorTypes.JOB_NOT_FOUND,
            detail=f"Job '{job_id}' wurde nicht gefunden."
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
    """Aktualisiert Job-Status im Memory und printi zu Logging."""
    print(f"[STATUS-UPDATE] Job {job_id} -> status: {status_str}, phase: {phase_str}", flush=True)
    job_manager.update_job(
        job_id,
        status=status_str,
        phase=phase_str
    )


async def run_batch_pipeline_task(job_id: str, settings_dict: dict, next_round: int, job_dir: Path):
    """Orchestriert die R-Skripte nacheinander im Hintergrund."""
    try:
        # 1. Schritt: R-Korrektur ausführen
        print(f"[PIPELINE] Starte Batch-Korrektur für Job {job_id}...", flush=True)
        covariates_str = ",".join(settings_dict.get("covariates", []))
        
        correction_result = await run_r_script(
            script="batch_correct.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="batch_correction",
            script_args=[settings_dict["batch_variable"], covariates_str]
        )
        
        if correction_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] Batch-Korrektur für Job {job_id} fehlgeschlagen.", flush=True)
            set_job_status(job_id, status_str="failed")
            return

        # 2. Schritt: SVD-Plot generieren
        print(f"[PIPELINE] Generiere SVD-Plot für Runde {next_round}...", flush=True)
        plot_result = await run_r_script(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="svd_plot",
            script_args=["corrected_data.rds", f"svd_plot_{next_round}.png", settings_dict["batch_variable"]]
        )
        
        if plot_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] SVD-Plot Generierung für Job {job_id} fehlgeschlagen.", flush=True)
            set_job_status(job_id, status_str="failed")
            return

        # 3. Schritt: Historie aktualisieren
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
        set_job_status(job_id, status_str="batch_done")
        print(f"[PIPELINE SUCCESS] Workflow für Job {job_id} komplett abgeschlossen!", flush=True)

    except Exception as e:
        print(f"[PIPELINE CRITICAL] Unerwarteter Fehler im Ablauf: {str(e)}", flush=True)
        set_job_status(job_id, status_str="failed")

def run_downstream_analysis_workflow(job_id: str, job_dir: str):
    """
    Extrahiert die Beta-Matrix (da Batch-Korrektur geskippt wurde)
    und führt nacheinander die DMP- und DMR-Skripte aus.
    """
    try:
        # 1. Status auf "running" für die Downstream-Phase setzen
        # batch_service.set_job_status(job_id, status_str="running", phase="downstream_analysis")
        print(f"[PIPELINE] Starte Downstream-Analyse für Job {job_id}...")

        # 2. Dynamisch das SampleSheet im Job-Verzeichnis finden
        csv_files = list(job_dir.glob("*SampleSheet*.csv"))
        if not csv_files:
            raise FileNotFoundError(f"Kein SampleSheet im Verzeichnis {job_dir} gefunden!")
        sample_sheet_path = csv_files[0]

        # Pfade definieren
        normalized_rds = os.path.join(job_dir, "normalized_data.rds")
        beta_rds = os.path.join(job_dir, "beta.rds") # Das Erwartungsobjekt für DMP/DMR

        # 3. BRIDGE-SCHRITT: Da ComBat geskippt wurde, extrahieren wir die Betas 
        # direkt via schnellem R-Inline-Befehl aus der normalisierten RDS.
        print("[PIPELINE] Extrahiere Beta-Matrix aus normalisierten Daten...")
        r_inline_cmd = (
            f"library(minfi); "
            f"normalized <- readRDS('{normalized_rds}'); "
            f"beta <- getBeta(normalized); "
            f"saveRDS(beta, '{beta_rds}')"
        )
        
        extract_proc = subprocess.run([
            "docker", "exec", "swtp-ss26-bigtom-r_worker-1", 
            "Rscript", "-e", r_inline_cmd
        ], capture_output=True, text=True, check=True)

        # 4. DMP SKRIPT AUFRUFEN
        # Argumente laut deinem Skript: <beta.rds> <sample_sheet.csv> <job_dir>
        print("[PIPELINE] Starte DMP-Analyse (dmp.R)...")
        dmp_cmd = [
            "docker", "exec", "swtp-ss26-bigtom-r_worker-1", "Rscript",
            "/app/r_backend/dmp.R", beta_rds, sample_sheet_path, job_dir
        ]
        subprocess.run(dmp_cmd, capture_output=True, text=True, check=True)
        print("[PIPELINE] DMP-Analyse erfolgreich beendet. CSV generiert.")

        # 5. DMR SKRIPT AUFRUFEN
        # Argumente laut deinem Skript: <beta.rds> <sample_sheet.csv> <job_dir>
        print("[PIPELINE] Starte DMR-Analyse (dmr.R)...")
        dmr_cmd = [
            "docker", "exec", "swtp-ss26-bigtom-r_worker-1", "Rscript",
            "/app/r_backend/dmr.R", beta_rds, sample_sheet_path, job_dir
        ]
        subprocess.run(dmr_cmd, capture_output=True, text=True, check=True)
        print("[PIPELINE] DMR-Analyse erfolgreich beendet. CSV generiert.")

        # 6. Workflow erfolgreich beenden
        # batch_service.set_job_status(job_id, status_str="completed", phase="done")
        print(f"[PIPELINE SUCCESS] Downstream-Analyse für Job {job_id} komplett abgeschlossen!")

    except subprocess.CalledProcessError as e:
        set_job_status(job_id, status_str="failed", phase_str="none")
        print(f"[PIPELINE ERROR] Fehler im R-Skript aufgetreten!", flush=True)
        print(f"[R-STDOUT] Grund:\n{e.stdout}", flush=True)
        print(f"[R-STDERR] (Warnungen & Logs):\n{e.stderr}", flush=True)
    except Exception as e:
        # Sonstige Python/Datei-Fehler
        # batch_service.set_job_status(job_id, status_str="failed", phase="none")
        print(f"[PIPELINE ERROR] Allgemeiner Fehler im Workflow: {str(e)}")