# app/services/batch_service.py
import json
from datetime import datetime
from pathlib import Path
import subprocess
import glob
import os
from typing import Optional
import glob
import csv

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

        sample_sheet_name = find_sample_sheet_name(str(job_dir))

        plot_result = await run_r_script(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="svd_plot",
            script_args=["corrected_data.rds", sample_sheet_name, f"svd_plot_{next_round}.png"]
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

def run_downstream_analysis_workflow(job_id: str, job_dir_raw: str):
    """
    Extrahiert die Beta-Matrix (da Batch-Korrektur geskippt wurde)
    und führt nacheinander die DMR- und danach die DMP-Skripte aus.
    """
    try:
        # FIX: Sicherstellen, dass job_dir ein Path-Objekt ist, sonst crashst du bei .glob()
        job_dir = Path(job_dir_raw).resolve()
        
        print(f"[PIPELINE] Starte Downstream-Analyse für Job {job_id}...")

        # 2. Dynamisch das SampleSheet im Job-Verzeichnis finden
        csv_files = list(job_dir.glob("*SampleSheet*.csv"))
        if not csv_files:
            raise FileNotFoundError(f"Kein SampleSheet im Verzeichnis {job_dir} gefunden!")
        sample_sheet_path = csv_files[0]

        # Pfade definieren
        normalized_rds = job_dir / "normalized_data.rds"
        beta_rds = job_dir / "beta.rds"

        # 3. BRIDGE-SCHRITT: Beta-Extraktion
        print("[PIPELINE] Extrahiere Beta-Matrix aus normalisierten Daten...")
        r_inline_cmd = (
            f"library(minfi); "
            f"normalized <- readRDS('{normalized_rds}'); "
            f"beta <- getBeta(normalized); "
            f"saveRDS(beta, '{beta_rds}')"
        )
        
        subprocess.run([
            "docker", "exec", "swtp-ss26-bigtom-r_worker-1", 
            "Rscript", "-e", r_inline_cmd
        ], capture_output=True, text=True, check=True)

        # 4. DMR SKRIPT AUFRUFEN (Logische Reihenfolge FIX: Muss zuerst laufen!)
        # Erzeugt die dmr.rds im job_dir
        print("[PIPELINE] Starte DMR-Analyse (dmr.R)...")
        dmr_cmd = [
            "docker", "exec", "swtp-ss26-bigtom-r_worker-1", "Rscript",
            "/app/r_backend/dmr.R", str(beta_rds), str(sample_sheet_path), str(job_dir)
        ]
        subprocess.run(dmr_cmd, capture_output=True, text=True, check=True)
        print("[PIPELINE] DMR-Analyse erfolgreich beendet. CSV und rds generiert.")

        # 5. DMP SKRIPT AUFRUFEN (Nutzt jetzt die frisch erzeugte dmr.rds für die Regionen-Verknüpfung)
        print("[PIPELINE] Starte DMP-Analyse (dmp.R)...")
        dmp_cmd = [
            "docker", "exec", "swtp-ss26-bigtom-r_worker-1", "Rscript",
            "/app/r_backend/dmp.R", str(beta_rds), str(sample_sheet_path), str(job_dir)
        ]
        subprocess.run(dmp_cmd, capture_output=True, text=True, check=True)
        print("[PIPELINE] DMP-Analyse erfolgreich beendet. Regionen verknüpft und CSV generiert.")

        print(f"[PIPELINE SUCCESS] Downstream-Analyse für Job {job_id} komplett abgeschlossen!")

    except subprocess.CalledProcessError as e:
        set_job_status(job_id, status_str="failed", phase_str="none")
        print(f"[PIPELINE ERROR] Fehler im R-Skript aufgetreten!", flush=True)
        print(f"[R-STDOUT] Grund:\n{e.stdout}", flush=True)
        print(f"[R-STDERR] (Warnungen & Logs):\n{e.stderr}", flush=True)
    except Exception as e:
        print(f"[PIPELINE ERROR] Allgemeiner Fehler im Workflow: {str(e)}")

# ÄNDERUNG: Um mögliche Probleme mit dem Suchen des SampleSheets für batch zu lösen
def find_sample_sheet_name(job_dir: str) -> str:
    """
    Finndet die SampleSheet-Datei.
    Nach dem Fix in save_sample_sheet() heißt sie immer 'SampleSheet.csv'.
    Als Fallback wird trotzdem nach dem alten Muster gesucht.
    """
    from app.core.error_types import BatchException, ErrorTypes

    # Primär: normalisierter Name
    normalized_path = Path(job_dir) / "SampleSheet.csv"
    if normalized_path.exists():
        return "SampleSheet.csv"

    # Fallback: altes Suchmuster (für Abwärtskompatibilität)
    matches = glob.glob(str(Path(job_dir) / "*SampleSheet*.csv"))
    if matches:
        return Path(matches[0]).name

    # Keine Datei gefunden → sauberer Fehler
    raise BatchException(
        ErrorTypes.SAMPLE_SHEET_NOT_FOUND,
        detail=f"Keine SampleSheet-Datei in {job_dir} gefunden. Erwartet: 'SampleSheet.csv'"
    )

def get_available_columns_from_samplesheet(job_dir: Path) -> list:
    """
    Sucht das Samplesheet, parst die Datenzeilen und gibt NUR Spalten zurück,
    die statistisch für ComBat geeignet sind (>= 2 Levels und < Anzahl Proben).
    """
    try:
        sample_sheet_name = find_sample_sheet_name(str(job_dir))
        sheet_path = job_dir / sample_sheet_name
    except FileNotFoundError:
        raise BatchException(
            ErrorTypes.SAMPLE_SHEET_NOT_FOUND,
            detail=f"Es wurde kein Samplesheet im Verzeichnis für Job '{job_dir.name}' gefunden."
        )

    try:
        with open(sheet_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        # 1. [Data] Sektion finden
        data_index = -1
        for i, line in enumerate(lines):
            if "[Data]" in line:
                data_index = i
                break

        # Slicing ab [Data]+1, falls nicht gefunden nehmen wir die ganze Datei
        data_lines = lines[data_index + 1:] if data_index != -1 else lines
        # Bereinigen von reinen Leerzeilen am Ende der Datei
        data_lines = [line.strip() for line in data_lines if line.strip()]

        if not data_lines:
            return []

        # 2. Trennzeichen ermitteln & CSV-Reader aufsetzen
        header_line = data_lines[0]
        delimiter = ";" if ";" in header_line else ","
        
        reader = csv.reader(data_lines, delimiter=delimiter)
        rows = list(reader)
        
        headers = [h.strip() for h in rows[0] if h.strip()]
        data_rows = rows[1:]
        total_samples = len(data_rows)

        if total_samples == 0:
            return []

        # 3. Werte pro Spalte sammeln (nur befüllte Werte zählen)
        num_cols = len(headers)
        col_values = {i: set() for i in range(num_cols)}

        for row in data_rows:
            # Falls Zeilen unvollständig sind, mit Leerstrings auffüllen
            while len(row) < num_cols:
                row.append("")
            for i in range(num_cols):
                val = row[i].strip()
                if val:  # Ignoriere leere Zellen
                    col_values[i].add(val)

        # 4. Filter-Logik nach ComBat-Kriterien anwenden
        eligible_columns = []
        for i, header in enumerate(headers):
            unique_count = len(col_values[i])
            
            # REGEL 1: Mindestens 2 verschiedene Werte nötig (verhindert leere/konstante Spalten)
            # REGEL 2: Weniger eindeutige Werte als Gesamtproben (verhindert eindeutige IDs wie Sample_Name)
            if 2 <= unique_count < total_samples:
                eligible_columns.append(header)

        return eligible_columns

    except Exception as e:
        raise BatchException(
            ErrorTypes.INVALID_CSV_CONTENT,
            detail=f"Das Samplesheet konnte nicht statistisch validiert werden: {str(e)}"
        )