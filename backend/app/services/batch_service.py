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
import asyncio

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
    """Orchestriert die R-Skripte nacheinander im Hintergrund mit Live-Fortschritt."""
    try:
        # 0. Initialisierung: Fortschritt für die neue Phase auf 0% zurücksetzen!
        job_manager.update_job(
            job_id,
            status="running",
            phase="batch_correction",
            progress_percent=0,
            current_step="Initialisiere Batch-Korrektur..."
        )

        # 1. Schritt: R-Korrektur ausführen
        print(f"[PIPELINE] Starte Batch-Korrektur für Job {job_id}...", flush=True)
        covariates_str = ",".join(settings_dict.get("covariates", []))
        
        # NEU: Das Callback-System fängt die R-Ausgaben ab und updatet das Frontend
        async def on_progress(data: dict):
            if data.get("type") == "progress":
                # Das R-Skript geht von 0-100%. Wir mappen das hier auf 0% bis 85%,
                # damit noch Puffer für den nachfolgenden SVD-Plot bleibt.
                progress = int(data["percent"] * 0.85)
                job_manager.update_job(
                    job_id,
                    status="running",
                    phase="batch_correction",
                    progress_percent=progress,
                    current_step=data["message"]
                )

        correction_result = await run_r_script(
            script="batch_correct.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="batch_correction",
            script_args=[settings_dict["batch_variable"], covariates_str],
            on_progress=on_progress  # <--- HIER WAR DER FEHLER: Jetzt übergeben!
        )
        
        if correction_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] Batch-Korrektur für Job {job_id} fehlgeschlagen.", flush=True)
            job_manager.update_job(
                job_id,
                status="failed",
                phase="batch_correction",
                current_step="Fehler während der mathematischen Batch-Korrektur."
            )
            return

        # 2. Schritt: SVD-Plot generieren
        print(f"[PIPELINE] Generiere SVD-Plot für Runde {next_round}...", flush=True)
        # SVD-Plot manuell auf 90% setzen
        job_manager.update_job(
            job_id,
            status="running",
            phase="batch_correction",
            progress_percent=90,
            current_step=f"Generiere SVD-Plot für Runde {next_round}..."
        )

        sample_sheet_name = find_sample_sheet_name(str(job_dir))

        plot_result = await run_r_script(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="svd_plot",
            script_args=["corrected_data.rds", sample_sheet_name, f"svd_plot_{next_round}.png"],
            on_progress=None
        )
        
        if plot_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] SVD-Plot Generierung für Job {job_id} fehlgeschlagen.", flush=True)
            job_manager.update_job(
                job_id,
                status="failed",
                phase="batch_correction",
                current_step="Fehler bei der SVD-Plot-Visualisierung."
            )
            return

        # 3. Schritt: Historie aktualisieren & Abschluss
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
        
        # Finale Vollendung: 100% und Status auf batch_done abändern
        job_manager.update_job(
            job_id,
            status="batch_done",
            phase="batch_correction",
            progress_percent=100,
            current_step="Batch-Korrektur erfolgreich abgeschlossen!"
        )
        print(f"[PIPELINE SUCCESS] Workflow für Job {job_id} komplett abgeschlossen!", flush=True)

    except Exception as e:
        print(f"[PIPELINE CRITICAL] Unerwarteter Fehler im Ablauf: {str(e)}", flush=True)
        job_manager.update_job(
            job_id,
            status="failed",
            phase="batch_correction",
            current_step=f"Kritischer Systemfehler: {str(e)}"
        )

async def run_downstream_analysis_workflow(
    job_id: str, 
    job_dir_raw: str, 
    adj_pval: float = 0.05, 
    array_type: str = "EPICv2",
    extract_from_normalized: bool = True
):
    """
    Führt nacheinander die DMR- und danach die DMP-Skripte aus – mit Live-Fortschritt.
    Extrahiert die Beta-Matrix nur dann, wenn extract_from_normalized=True (Skip-Szenario).
    """
    try:
        job_dir = Path(job_dir_raw).resolve()
        print(f"[PIPELINE] Starte Downstream-Analyse für Job {job_id}...", flush=True)

        # 1. Initialisierung im Frontend
        job_manager.update_job(
            job_id,
            status="running",
            phase="downstream_analysis",
            progress_percent=0,
            current_step="Starte Downstream-Analyse-Pipeline..."
        )

        # 2. Dynamisch das SampleSheet im Job-Verzeichnis finden
        csv_files = list(job_dir.glob("*SampleSheet*.csv"))
        if not csv_files:
            raise FileNotFoundError(f"Kein SampleSheet im Verzeichnis {job_dir} gefunden!")
        sample_sheet_path = csv_files[0]

        normalized_rds = job_dir / "normalized_data.rds"
        beta_rds = job_dir / "beta.rds"

        # 3. KONDITIONELLER BRIDGE-SCHRITT: Beta-Extraktion
        if extract_from_normalized:
            # SZNARIO A: User hat Batch-Korrektur übersprungen -> Aus normalized extrahieren
            print("[PIPELINE] Batch-Korrektur übersprungen. Extrahiere unkorrigierte Beta-Matrix...", flush=True)
            job_manager.update_job(
                job_id,
                status="running",
                phase="downstream_analysis",
                progress_percent=2,
                current_step="Extrahiere Beta-Matrix aus normalisierten Daten..."
            )
            
            r_inline_cmd = (
                f"library(minfi); "
                f"normalized <- readRDS('{normalized_rds}'); "
                f"beta <- getBeta(normalized); "
                f"saveRDS(beta, '{beta_rds}')"
            )
            
            proc = await asyncio.create_subprocess_exec(
                "docker", "exec", "swtp-ss26-bigtom-r_worker-1", "Rscript", "-e", r_inline_cmd,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            stdout, stderr = await proc.communicate()
            
            if proc.returncode != 0:
                raise RuntimeError(f"Beta-Extraktion fehlgeschlagen: {stderr.decode('utf-8', errors='ignore')}")
        else:
            # SZENARIO B: Korrektur lief vorher -> 'beta.rds' enthält bereits die korrigierten Daten!
            print("[PIPELINE] Nutze bereits vorhandene, korrigierte 'beta.rds' aus der Batch-Korrektur.", flush=True)
            job_manager.update_job(
                job_id,
                status="running",
                phase="downstream_analysis",
                progress_percent=5,
                current_step="Lade korrigierte Batch-Daten..."
            )

        # 4. DMR SKRIPT AUFRUFEN
        print("[PIPELINE] Starte DMR-Analyse (dmr.R)...", flush=True)
        
        async def on_dmr_progress(data: dict):
            if data.get("type") == "progress":
                progress = 10 + int(data["percent"] * 0.45)
                job_manager.update_job(
                    job_id,
                    status="running",
                    phase="downstream_analysis",
                    progress_percent=progress,
                    current_step=f"DMR: {data['message']}"
                )

        dmr_args = ["beta.rds", "3", "NULL", str(adj_pval), "1000", array_type, "10", "1"]

        dmr_result = await run_r_script(
            script="dmr.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_path.name,
            mode="dmr_analysis",
            script_args=dmr_args,
            on_progress=on_dmr_progress
        )

        if dmr_result.get("returncode") != 0:
            raise RuntimeError("Das DMR-Skript hat einen Fehler gemeldet.")

        print("[PIPELINE] DMR-Analyse erfolgreich beendet.", flush=True)

        # 5. DMP SKRIPT AUFRUFEN
        print("[PIPELINE] Starte DMP-Analyse (dmp.R)...", flush=True)

        async def on_dmp_progress(data: dict):
            if data.get("type") == "progress":
                progress = 55 + int(data["percent"] * 0.43)
                job_manager.update_job(
                    job_id,
                    status="running",
                    phase="downstream_analysis",
                    progress_percent=progress,
                    current_step=f"DMP: {data['message']}"
                )

        dmp_args = ["beta.rds", str(adj_pval), array_type]

        dmp_result = await run_r_script(
            script="dmp.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_path.name,
            mode="dmp_analysis",
            script_args=dmp_args,
            on_progress=on_dmp_progress
        )

        if dmp_result.get("returncode") != 0:
            raise RuntimeError("Das DMP-Skript hat einen Fehler gemeldet.")

        print("[PIPELINE] DMP-Analyse erfolgreich beendet.", flush=True)

        # 6. FINALE VOLLENDUNG
        job_manager.update_job(
            job_id,
            status="analysis_done",
            phase="downstream_analysis",
            progress_percent=100,
            current_step="Downstream-Analyse erfolgreich beendet!"
        )
        print(f"[PIPELINE SUCCESS] Downstream-Analyse für Job {job_id} komplett abgeschlossen!", flush=True)

    except Exception as e:
        print(f"[PIPELINE ERROR] Allgemeiner Fehler im Workflow: {str(e)}", flush=True)
        job_manager.update_job(
            job_id,
            status="failed",
            phase="downstream_analysis",
            current_step=f"Fehler in der Analyse: {str(e)}"
        )
        
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