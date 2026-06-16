# app/services/heatmap_service.py

import csv
import json
import os
from collections import Counter
from pathlib import Path
from typing import Optional

from app.core.error_types import AppException, ErrorTypes
from app.models.heatmap import DmpFilterPayload, GroupingPayload
from app.services.r_executor import run_r_script
from app.services.batch_service import find_sample_sheet_name
from app.services.job_manager import transition_job, set_progress, get_job, JobPhase, JobStatusValue

JOBS_DIR         = Path("jobs").resolve()
MAX_CPGS         = 500
HEATMAP_FILENAME = "heatmap.png"


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_job_dir_or_404(job_id: str) -> Path:
    job_dir = JOBS_DIR / job_id
    if not job_dir.exists() or not job_dir.is_dir():
        raise AppException(
            ErrorTypes.JOB_NOT_FOUND,
            detail=f"Job '{job_id}' wurde nicht gefunden."
        )
    return job_dir


def _find_dmp_rds(job_dir: Path) -> Path:
    for candidate in ("dmp_results.rds", "dmp.rds"):
        p = job_dir / candidate
        if p.exists():
            return p

    matches = list(job_dir.glob("*dmp*.rds"))
    if matches:
        return matches[0]

    raise AppException(
        ErrorTypes.FILE_NOT_FOUND,
        detail=(
            f"Keine DMP-Ergebnis-RDS-Datei in Job '{job_dir.name}' gefunden. "
            "Erwartet: 'dmp_results.rds' oder ein Dateiname mit 'dmp'."
        )
    )


def _build_r_env(
    grouping:   GroupingPayload,
    dmp_filter: Optional[DmpFilterPayload],
) -> dict:
    env: dict = {
        "HEATMAP_GROUP1":   grouping.primary,
        "HEATMAP_MAX_ROWS": str(MAX_CPGS),
        "HEATMAP_OUTPUT":   HEATMAP_FILENAME,
    }

    if grouping.secondary:
        env["HEATMAP_GROUP2"] = grouping.secondary

    if dmp_filter:
        if dmp_filter.chromosome:
            env["HEATMAP_CHR"] = dmp_filter.chromosome
        if dmp_filter.start is not None:
            env["HEATMAP_START"] = str(dmp_filter.start)
        if dmp_filter.stop is not None:
            env["HEATMAP_STOP"] = str(dmp_filter.stop)
        if dmp_filter.p_value_max is not None:
            env["HEATMAP_PVAL_MAX"] = str(dmp_filter.p_value_max)
        if dmp_filter.adj_p_value_max is not None:
            env["HEATMAP_ADJ_PVAL_MAX"] = str(dmp_filter.adj_p_value_max)
        if dmp_filter.delta_beta_min is not None:
            env["HEATMAP_DELTA_BETA_MIN"] = str(dmp_filter.delta_beta_min)
        if dmp_filter.delta_beta_max is not None:
            env["HEATMAP_DELTA_BETA_MAX"] = str(dmp_filter.delta_beta_max)
        if dmp_filter.dmr_id:
            env["HEATMAP_DMR_ID"] = dmp_filter.dmr_id

    return env


# ── Async pipeline task ───────────────────────────────────────────────────────

async def run_heatmap_pipeline_task(
    job_id:     str,
    job_dir:    Path,
    dmp_rds:    Path,
    sheet_name: str,
    grouping:   GroupingPayload,
    dmp_filter: Optional[DmpFilterPayload],
):
    """
    Führt heatmap.R im Docker-Container aus und aktualisiert den Job-Status
    live per on_progress-Callback. Wird als BackgroundTask gestartet.
    transition_job zu HEATMAP+RUNNING erfolgt bereits in der Route.
    """
    try:
        # Initialen Fortschritt setzen (Phase bereits durch Route auf HEATMAP+RUNNING gesetzt)
        set_progress(job_id, percent=0, message="Starte Heatmap-Generierung...")

        # ── Progress-Callback ──────────────────────────────────────────────────
        async def on_progress(data: dict):
            if not isinstance(data, dict):
                return
            if data.get("type") == "progress":
                step  = int(data.get("step", 1))
                total = int(data.get("total_steps", 8))
                pct   = 5 + int((step / total) * 90)
                set_progress(job_id, percent=pct, message=data.get("message", ""))

        # ── R-Skript aufrufen ──────────────────────────────────────────────────
        r_env = _build_r_env(grouping, dmp_filter)

        result = await run_r_script(
            script="heatmap.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sheet_name,
            mode="heatmap",
            script_args=[
                str(dmp_rds.name),
                sheet_name,
            ],
            on_progress=on_progress,
            extra_env=r_env,
        )

        # ── Fehlerfall ─────────────────────────────────────────────────────────
        if result.get("returncode") != 0:
            stdout    = result.get("stdout", "")
            too_many  = _parse_too_many_cpgs(stdout)

            error_payload = {
                "type":     "https://api.bigtom.swtp/errors/heatmap-too-many-cpgs",
                "title":    "Too many CpGs for heatmap",
                "status":   400,
                "detail":   (
                    f"At most {MAX_CPGS} allowed. "
                    f"Found: {too_many if too_many else 'unknown count'}."
                ),
                "instance": f"/api/v1/heatmap/{job_id}",
            }

            transition_job(
                job_id,
                new_phase=JobPhase.HEATMAP,
                new_status=JobStatusValue.FAILED,
                current_step=error_payload["detail"],
                error=error_payload,
            )
            return

        # ── Erfolg ─────────────────────────────────────────────────────────────
        transition_job(
            job_id,
            new_phase=JobPhase.HEATMAP,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Heatmap erfolgreich generiert.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.RESULTS,
            new_status=JobStatusValue.WAITING,
            current_step="Heatmap abgeschlossen. Zurück zur Ergebnisansicht.",
        )

    except Exception as exc:
        print(f"[HEATMAP PIPELINE ERROR] {exc}", flush=True)
        transition_job(
            job_id,
            new_phase=JobPhase.HEATMAP,
            new_status=JobStatusValue.FAILED,
            current_step=f"Kritischer Fehler: {exc}",
            error={"detail": str(exc)},
        )


# ── Helper: R-Output parsen ───────────────────────────────────────────────────

def _parse_too_many_cpgs(stdout: str) -> Optional[int]:
    import re

    for line in stdout.splitlines():
        try:
            data = json.loads(line)
            if not isinstance(data, dict):
                continue

            log_type = data.get("type") or data.get("status")

            if log_type in ("failed", "error"):
                msg: str = data.get("message", "")
                if "Too many rows" in msg:
                    match = re.search(r"(\d+)\s+entries", msg)
                    if match:
                        return int(match.group(1))
                    match_any_digit = re.search(r"\d+", msg)
                    if match_any_digit:
                        return int(match_any_digit.group())
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def _parse_heatmap_metadata(stdout: str, job_dir: Path) -> dict:
    detected_cpgs   = 0
    plotted_samples = 0

    for line in stdout.splitlines():
        try:
            data = json.loads(line)
            if not isinstance(data, dict):
                continue

            if data.get("status") == "running" and "Beta matrix ready" in data.get("message", ""):
                msg   = data["message"]
                parts = msg.split()
                idx_rows = next((i for i, t in enumerate(parts) if t == "rows"), None)
                idx_cols = next((i for i, t in enumerate(parts) if t == "columns"), None)
                if idx_rows and parts[idx_rows - 1].isdigit():
                    detected_cpgs = int(parts[idx_rows - 1])
                if idx_cols and parts[idx_cols - 1].isdigit():
                    plotted_samples = int(parts[idx_cols - 1])
                break
        except (json.JSONDecodeError, ValueError):
            pass

    return {
        "detected_cpgs":   detected_cpgs,
        "plotted_samples": plotted_samples,
        "message":         "Heatmap erfolgreich generiert. PNG kann abgerufen werden.",
    }


def get_grouping_options_from_samplesheet(job_dir: Path) -> list:
    """
    Parst das SampleSheet und wendet die vier Heatmap-Filterregeln an:
      REGEL 1 – Kein Wert darf einzigartig sein (jeder Wert mind. 2×)
      REGEL 2 – Spalte darf nicht leer sein
      REGEL 3 – Mind. 2 unterschiedliche Werte
      REGEL 4 – Anzahl der Gruppen ≤ 50 % der Probenanzahl
    """
    sample_sheet_name = find_sample_sheet_name(str(job_dir))
    sheet_path = job_dir / sample_sheet_name

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
        delimiter   = ";" if ";" in header_line else ","

        reader    = csv.reader(data_lines, delimiter=delimiter)
        rows      = list(reader)
        headers   = [h.strip() for h in rows[0] if h.strip()]
        data_rows = rows[1:]
        total_samples = len(data_rows)

        if total_samples == 0:
            return []

        num_cols   = len(headers)
        col_values = {i: [] for i in range(num_cols)}

        for row in data_rows:
            while len(row) < num_cols:
                row.append("")
            for i in range(num_cols):
                val = row[i].strip()
                if val:
                    col_values[i].append(val)

        eligible_columns = []

        for i, header in enumerate(headers):
            values = col_values[i]

            if not values:
                continue

            counter      = Counter(values)
            unique_count = len(counter)

            if unique_count < 2:
                continue

            if any(count < 2 for count in counter.values()):
                continue

            if unique_count > (0.5 * total_samples):
                continue

            eligible_columns.append(header)

        return eligible_columns

    except Exception as e:
        raise AppException(
            ErrorTypes.INVALID_CSV_CONTENT,
            detail=f"SampleSheet konnte für die Heatmap nicht analysiert werden: {e}",
        )