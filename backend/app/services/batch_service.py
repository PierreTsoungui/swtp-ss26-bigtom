# app/services/batch_service.py
import json
import csv
import glob
import asyncio
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.error_types import BatchException, ErrorTypes
from app.services.r_executor import run_r_script
from app.services.job_manager import transition_job, set_progress, JobPhase, JobStatusValue


JOBS_DIR = Path("jobs").resolve()


# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

def get_job_dir_or_404(job_id: str) -> Path:
    job_dir = JOBS_DIR / job_id
    if not job_dir.exists() or not job_dir.is_dir():
        raise BatchException(
            ErrorTypes.JOB_NOT_FOUND,
            detail=f"Job '{job_id}' wurde nicht gefunden."
        )
    return job_dir


def find_sample_sheet_name(job_dir: str) -> str:
    normalized_path = Path(job_dir) / "SampleSheet.csv"
    if normalized_path.exists():
        return "SampleSheet.csv"

    matches = glob.glob(str(Path(job_dir) / "*SampleSheet*.csv"))
    if matches:
        return Path(matches[0]).name

    raise BatchException(
        ErrorTypes.SAMPLE_SHEET_NOT_FOUND,
        detail=f"Keine SampleSheet-Datei in {job_dir} gefunden. Erwartet: 'SampleSheet.csv'"
    )


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


def save_history(job_dir: Path, data: dict) -> None:
    history_file = job_dir / "batch_history.json"
    with open(history_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def get_available_columns_from_samplesheet(job_dir: Path) -> list:
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

        data_index = -1
        for i, line in enumerate(lines):
            if "[Data]" in line:
                data_index = i
                break

        data_lines = lines[data_index + 1:] if data_index != -1 else lines
        data_lines = [line.strip() for line in data_lines if line.strip()]

        if not data_lines:
            return []

        header_line = data_lines[0]
        delimiter = ";" if ";" in header_line else ","

        reader = csv.reader(data_lines, delimiter=delimiter)
        rows = list(reader)

        headers = [h.strip() for h in rows[0] if h.strip()]
        data_rows = rows[1:]
        total_samples = len(data_rows)

        if total_samples == 0:
            return []

        num_cols = len(headers)
        col_values = {i: set() for i in range(num_cols)}

        for row in data_rows:
            while len(row) < num_cols:
                row.append("")
            for i in range(num_cols):
                val = row[i].strip()
                if val:
                    col_values[i].add(val)

        eligible_columns = []
        for i, header in enumerate(headers):
            unique_count = len(col_values[i])
            if 2 <= unique_count < total_samples:
                eligible_columns.append(header)

        return eligible_columns

    except Exception as e:
        raise BatchException(
            ErrorTypes.INVALID_CSV_CONTENT,
            detail=f"Das Samplesheet konnte nicht statistisch validiert werden: {str(e)}"
        )


# ── Pipeline-Tasks ────────────────────────────────────────────────────────────

async def run_batch_pipeline_task(
    job_id: str,
    settings_dict: dict,
    next_round: int,
    job_dir: Path
) -> None:
    try:
        # 1. R-Korrektur ausführen — 0 bis 100 %
        print(f"[PIPELINE] Starte Batch-Korrektur für Job {job_id}...", flush=True)
        set_progress(job_id, percent=0, message="Initialisiere Batch-Korrektur...")

        covariates_str = ",".join(settings_dict.get("covariates", []))

        async def on_batch_progress(data: dict) -> None:
            if data.get("type") == "progress":
                set_progress(              # ← kein * 0.85 mehr
                    job_id,
                    percent=data["percent"],
                    message=data["message"],
                )

        correction_result = await run_r_script(
            script="batch_correct.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="batch_correction",
            script_args=[settings_dict["batch_variable"], covariates_str],
            on_progress=on_batch_progress,
        )

        if correction_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] Batch-Korrektur für Job {job_id} fehlgeschlagen.", flush=True)
            transition_job(
                job_id,
                new_phase=JobPhase.BATCH,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler während der mathematischen Batch-Korrektur.",
                error={"detail": "batch_correct.R mit Fehlercode beendet."},
            )
            return

        # Batch abgeschlossen → SVD-Phase öffnen (analog normalize.py)
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Batch-Korrektur erfolgreich abgeschlossen.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.SVD,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step=f"Starte SVD-Plot-Generierung (Runde {next_round})...",
        )

        # 2. SVD-Plot generieren — eigener 0-bis-100-Zyklus
        print(f"[PIPELINE] Generiere SVD-Plot für Runde {next_round}...", flush=True)

        async def on_svd_progress(data: dict) -> None:
            if data.get("type") == "progress":
                set_progress(
                    job_id,
                    percent=data["percent"],
                    message=f"SVD (Runde {next_round}): {data['message']}",
                )

        sample_sheet_name = find_sample_sheet_name(str(job_dir))

        plot_result = await run_r_script(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet="",
            mode="svd_plot",
            script_args=["corrected_data.rds", sample_sheet_name, f"svd_plot_{next_round}.png"],
            on_progress=on_svd_progress,   # ← war None vorher
        )

        if plot_result.get("returncode") != 0:
            print(f"[PIPELINE ERROR] SVD-Plot für Job {job_id} fehlgeschlagen.", flush=True)
            transition_job(
                job_id,
                new_phase=JobPhase.SVD,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler bei der SVD-Plot-Visualisierung.",
                error={"detail": "batch_svd.R mit Fehlercode beendet."},
            )
            return

        # 3. Historie aktualisieren
        print(f"[PIPELINE] Beide R-Skripte erfolgreich. Aktualisiere Historie...", flush=True)
        history_data = load_history(job_dir, job_id)
        history_data["rounds"].append({
            "round": next_round,
            "type": "correction",
            "svd_plot": f"/api/v1/batch/{job_id}/svd-plot/{next_round}",
            "settings_used": settings_dict,
            "timestamp": datetime.now().isoformat()
        })
        history_data["current_round"] = next_round
        history_data["correction_applied"] = True
        save_history(job_dir, history_data)

        # 4. SVD abschließen → Batch-Phase wieder öffnen
        transition_job(
            job_id,
            new_phase=JobPhase.SVD,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="SVD-Plot erfolgreich generiert.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.WAITING,
            current_step="Batch-Korrektur abgeschlossen. Warte auf nächste Aktion...",
        )
        print(f"[PIPELINE SUCCESS] Batch-Workflow für Job {job_id} abgeschlossen.", flush=True)

    except Exception as e:
        print(f"[PIPELINE CRITICAL] Unerwarteter Fehler: {str(e)}", flush=True)
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.FAILED,
            current_step=f"Kritischer Systemfehler: {str(e)}",
            error={"detail": str(e)},
        )


async def run_downstream_analysis_workflow(
    job_id: str,
    job_dir_raw: str,
    adj_pval: float = 0.05,
    array_type: str = "EPICv2",
    extract_from_normalized: bool = True,
) -> None:
    """
    Führt nacheinander DMR- und DMP-Analyse aus.
    Bei extract_from_normalized=True (Skip): Route hat bereits ANALYSIS+RUNNING gesetzt.
    Bei extract_from_normalized=False (nach Batch): hier selbst ANALYSIS+RUNNING setzen.
    """
    try:
        job_dir = Path(job_dir_raw).resolve()
        print(f"[PIPELINE] Starte Downstream-Analyse für Job {job_id}...", flush=True)

        if not extract_from_normalized:
            # Nach Batch-Korrektur: Übergang zu ANALYSIS+RUNNING hier
            transition_job(
                job_id,
                new_phase=JobPhase.ANALYSIS,
                new_status=JobStatusValue.RUNNING,
                progress_percent=0,
                current_step="Starte Downstream-Analyse-Pipeline...",
            )
        else:
            # Skip-Szenario: Route hat bereits ANALYSIS+RUNNING gesetzt
            set_progress(job_id, percent=0, message="Starte Downstream-Analyse-Pipeline...")

        # SampleSheet ermitteln
        csv_files = list(job_dir.glob("*SampleSheet*.csv"))
        if not csv_files:
            raise FileNotFoundError(f"Kein SampleSheet im Verzeichnis {job_dir} gefunden.")
        sample_sheet_path = csv_files[0]

        normalized_rds = job_dir / "normalized_data.rds"
        beta_rds       = job_dir / "beta.rds"

        # Bridge-Schritt: Beta-Extraktion nur wenn Batch übersprungen wurde
        if extract_from_normalized:
            print("[PIPELINE] Batch übersprungen — extrahiere unkorrigierte Beta-Matrix...", flush=True)
            set_progress(job_id, percent=2, message="Extrahiere Beta-Matrix aus normalisierten Daten...")

            r_inline_cmd = (
                f"library(minfi); "
                f"normalized <- readRDS('{normalized_rds}'); "
                f"beta <- getBeta(normalized); "
                f"saveRDS(beta, '{beta_rds}')"
            )
            proc = await asyncio.create_subprocess_exec(
                "docker", "exec", "swtp-ss26-bigtom-r_worker-1",
                "Rscript", "-e", r_inline_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            if proc.returncode != 0:
                raise RuntimeError(
                    f"Beta-Extraktion fehlgeschlagen: {stderr.decode('utf-8', errors='ignore')}"
                )
        else:
            print("[PIPELINE] Nutze korrigierte beta.rds aus der Batch-Korrektur.", flush=True)
            set_progress(job_id, percent=5, message="Lade korrigierte Batch-Daten...")

        # DMR-Analyse
        print("[PIPELINE] Starte DMR-Analyse (dmr.R)...", flush=True)

        async def on_dmr_progress(data: dict) -> None:
            if data.get("type") == "progress":
                set_progress(
                    job_id,
                    percent=10 + int(data["percent"] * 0.45),
                    message=f"DMR: {data['message']}",
                )

        dmr_result = await run_r_script(
            script="dmr.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_path.name,
            mode="dmr_analysis",
            script_args=["beta.rds", "3", "NULL", str(adj_pval), "1000", array_type, "10", "1"],
            on_progress=on_dmr_progress,
        )

        if dmr_result.get("returncode") != 0:
            raise RuntimeError("Das DMR-Skript hat einen Fehler gemeldet.")

        print("[PIPELINE] DMR-Analyse erfolgreich.", flush=True)

        # DMP-Analyse
        print("[PIPELINE] Starte DMP-Analyse (dmp.R)...", flush=True)

        async def on_dmp_progress(data: dict) -> None:
            if data.get("type") == "progress":
                set_progress(
                    job_id,
                    percent=55 + int(data["percent"] * 0.43),
                    message=f"DMP: {data['message']}",
                )

        dmp_result = await run_r_script(
            script="dmp.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_path.name,
            mode="dmp_analysis",
            script_args=["beta.rds", str(adj_pval), array_type],
            on_progress=on_dmp_progress,
        )

        if dmp_result.get("returncode") != 0:
            raise RuntimeError("Das DMP-Skript hat einen Fehler gemeldet.")

        print("[PIPELINE] DMP-Analyse erfolgreich.", flush=True)

        # Analyse abschließen → Results-Phase
        transition_job(
            job_id,
            new_phase=JobPhase.ANALYSIS,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Downstream-Analyse erfolgreich beendet.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.RESULTS,
            new_status=JobStatusValue.WAITING,
        )
        print(f"[PIPELINE SUCCESS] Downstream-Analyse für Job {job_id} abgeschlossen.", flush=True)

    except Exception as e:
        print(f"[PIPELINE ERROR] Allgemeiner Fehler: {str(e)}", flush=True)
        transition_job(
            job_id,
            new_phase=JobPhase.ANALYSIS,
            new_status=JobStatusValue.FAILED,
            current_step=f"Fehler in der Analyse: {str(e)}",
            error={"detail": str(e)},
        )