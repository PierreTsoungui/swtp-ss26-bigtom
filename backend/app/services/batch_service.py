# app/services/batch_service.py
import asyncio
import json
import csv
import glob
import logging
import shutil
from datetime import datetime
from pathlib import Path

from app.core.error_types import BatchException, ErrorTypes
from app.services.job_manager import transition_job, set_progress, JobPhase, JobStatusValue
from app.services.r_executor import (
    run_r_script,
    ExecutionResult,
    BatchCorrectionCommand,
    SvdPlotCommand,
    DmrAnalysisCommand,
    DmpAnalysisCommand,
    BetaExtractionCommand,
)

logger = logging.getLogger(__name__)


def _failure_detail(result: ExecutionResult, fallback: str) -> str:
    """Best human-readable reason for a failed R step.

    Prefer the structured message the R script emitted via {"type":"error"}
    (captured in extra["r_error"]) over the raw stderr dump, which is full of
    package-loading noise and would otherwise be shown to the user verbatim.
    Falls back to a generic message (e.g. on timeout, where neither is set).
    """
    return result.extra.get("r_error") or (result.stderr or "").strip() or fallback

JOBS_DIR = Path("jobs").resolve()

# The sample-sheet column the downstream analysis (dmr.R / dmp.R) compares groups
# by. It must never be chosen as a batch variable: removing it via
# removeBatchEffect would erase exactly the biological signal DMP/DMR test for,
# yielding empty results. It may, however, be protected as a covariate.
PHENOTYPE_COLUMN = "Sample_Group"


def _progress_fields(data: dict) -> tuple[int, str]:
    """Extract (percent, message) from an R progress message, tolerating the
    alternative key names R may emit and missing keys."""
    percent = data.get("percent", data.get("progress_percent", 0))
    message = data.get("message", data.get("current_step", ""))
    return percent, message


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


def next_correction_round(history: dict) -> int:
    """Round number for the next batch correction.

    Round numbering equals the SVD plot index (``svd_plot_<round>.png``):
    round 0 is the post-normalization baseline, round N the state after the
    N-th correction. Derived from the existing rounds rather than a stored
    counter, so it stays correct even if the history is edited or a counter
    drifts.
    """
    rounds = history.get("rounds", [])
    return max((r.get("round", 0) for r in rounds), default=0) + 1


def load_history(job_dir: Path, job_id: str) -> dict:
    history_file = job_dir / "batch_history.json"
    if not history_file.exists():
        # Round 0 is the baseline SVD produced by normalization (svd_plot_0.png),
        # before any correction. The first correction is therefore round 1.
        initial_history = {
            "job_id": job_id,
            "rounds": [
                {
                    "round": 0,
                    "type": "initial",
                    "svd_plot": f"/api/v1/batch/{job_id}/svd-plot/0",
                    "settings_used": None,
                    "timestamp": datetime.now().isoformat()
                }
            ],
            "current_round": 0,
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
# Each pipeline coroutine receives its cancel_event from the route's
# start_job_pipeline()/run_job_pipeline() wrapper. It must NOT create or
# register a cancel_event or wrap the task lifecycle itself
# (see r_executor_spec.md section 6, rule 3).

async def run_batch_pipeline_task(
    job_id: str,
    settings_dict: dict,
    next_round: int,
    job_dir: Path,
    cancel_event: asyncio.Event,
) -> None:
    """Runs batch correction (batch_correct.R) followed by the SVD plot."""
    try:
        logger.info("Starte Batch-Korrektur: job_id=%s", job_id)
        set_progress(job_id, percent=0, message="Initialisiere Batch-Korrektur...")

        covariates_str = ",".join(settings_dict.get("covariates", []))

        async def on_batch_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = _progress_fields(data)
                set_progress(job_id, percent=percent, message=message)

        correction_result = await run_r_script(
            command=BatchCorrectionCommand(
                script="batch_correct.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet="",
                extra_args=[settings_dict["batch_variable"], covariates_str],
            ),
            cancel_event=cancel_event,
            on_progress=on_batch_progress,
        )

        if correction_result.is_cancelled:
            logger.info("Batch-Korrektur abgebrochen: job_id=%s", job_id)
            return

        if correction_result.is_timeout:
            logger.error("Batch-Korrektur Timeout: job_id=%s", job_id)
            transition_job(
                job_id,
                new_phase=JobPhase.BATCH,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler: batch_correct.R hat das Zeitlimit überschritten.",
                error={"detail": "Batch correction timeout."},
            )
            return

        if not correction_result.is_success:
            detail = _failure_detail(correction_result, "batch_correct.R mit Fehlercode beendet.")
            logger.error("Batch-Korrektur fehlgeschlagen: job_id=%s detail=%s", job_id, detail)
            transition_job(
                job_id,
                new_phase=JobPhase.BATCH,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler während der mathematischen Batch-Korrektur.",
                error={"detail": detail},
            )
            return

        # Batch abgeschlossen → SVD-Phase öffnen
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

        # SVD-Plot generieren
        logger.info("Generiere SVD-Plot: job_id=%s round=%s", job_id, next_round)

        async def on_svd_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = _progress_fields(data)
                set_progress(
                    job_id,
                    percent=percent,
                    message=f"SVD (Runde {next_round}): {message}",
                )

        sample_sheet_name = find_sample_sheet_name(str(job_dir))

        plot_result = await run_r_script(
            command=SvdPlotCommand(
                script="batch_svd.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet="",
                beta_file="corrected_data.rds",
                sample_sheet_file=sample_sheet_name,
                plot_name=f"svd_plot_{next_round}.png",
            ),
            cancel_event=cancel_event,
            on_progress=on_svd_progress,
        )

        if plot_result.is_cancelled:
            logger.info("SVD-Plot abgebrochen: job_id=%s", job_id)
            return

        if plot_result.is_timeout:
            logger.error("SVD-Plot Timeout: job_id=%s", job_id)
            transition_job(
                job_id,
                new_phase=JobPhase.SVD,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler: batch_svd.R hat das Zeitlimit überschritten.",
                error={"detail": "SVD plot timeout."},
            )
            return

        if not plot_result.is_success:
            logger.error("SVD-Plot fehlgeschlagen: job_id=%s", job_id)
            transition_job(
                job_id,
                new_phase=JobPhase.SVD,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler bei der SVD-Plot-Visualisierung.",
                error={"detail": plot_result.stderr or "batch_svd.R mit Fehlercode beendet."},
            )
            return

        # Historie aktualisieren
        logger.info("Aktualisiere Batch-Historie: job_id=%s", job_id)
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

        # SVD abschließen → Batch-Phase wieder öffnen
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
        logger.info("Batch-Workflow abgeschlossen: job_id=%s", job_id)

    except Exception:
        logger.exception("Kritischer Fehler im Batch-Pipeline-Task: job_id=%s", job_id)
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.FAILED,
            current_step="Kritischer Systemfehler.",
            error={"detail": "Internal batch pipeline crash."},
        )


async def run_downstream_analysis_task(
    job_id: str,
    job_dir_raw: str,
    cancel_event: asyncio.Event,
    *,
    adj_pval: float = 0.05,
    array_type: str = "EPICv2",
    extract_from_normalized: bool = True,
) -> None:
    """
    Runs DMR analysis followed by DMP analysis.

    The caller (batch route) owns the ANALYSIS+RUNNING transition. This flag
    only selects the beta source: extract_from_normalized=True reads the
    uncorrected normalized data, =False uses the batch-corrected matrix.
    """
    try:
        job_dir = Path(job_dir_raw).resolve()
        logger.info("Starte Downstream-Analyse: job_id=%s", job_id)

        set_progress(job_id, percent=0, message="Starte Downstream-Analyse-Pipeline...")

        sample_sheet_name = find_sample_sheet_name(str(job_dir))

        # Bridge-Schritt: Beta-Extraktion nur wenn Batch übersprungen wurde
        if extract_from_normalized:
            logger.info("Batch übersprungen — extrahiere unkorrigierte Beta-Matrix: job_id=%s", job_id)
            set_progress(job_id, percent=2, message="Extrahiere Beta-Matrix aus normalisierten Daten...")

            # FIX: nutzt jetzt docker_job_dir (Container-Pfad) statt Host-Pfad.
            extraction_result = await run_r_script(
                command=BetaExtractionCommand(
                    script="",
                    job_id=job_id,
                    job_dir=str(job_dir),
                    sample_sheet="",
                ),
                cancel_event=cancel_event,
                on_progress=None,
            )

            if extraction_result.is_cancelled:
                logger.info("Beta-Extraktion abgebrochen: job_id=%s", job_id)
                return

            if not extraction_result.is_success:
                raise RuntimeError(
                    _failure_detail(extraction_result, "Beta-Extraktion fehlgeschlagen.")
                )
        else:
            # corrected_data.rds is already a beta matrix (removeBatchEffect on
            # getBeta). DMR/DMP read beta.rds, so make the corrected matrix the
            # analysis input by copying it into place.
            logger.info("Nutze batch-korrigierte Daten für die Analyse: job_id=%s", job_id)
            set_progress(job_id, percent=5, message="Lade korrigierte Batch-Daten...")
            corrected_path = job_dir / "corrected_data.rds"
            if not corrected_path.exists():
                raise RuntimeError(
                    f"corrected_data.rds nicht gefunden in {job_dir} — Batch-Korrektur "
                    "lieferte keine Daten."
                )
            shutil.copyfile(corrected_path, job_dir / "beta.rds")

        # DMR-Analyse
        logger.info("Starte DMR-Analyse (dmr.R): job_id=%s", job_id)

        async def on_dmr_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = _progress_fields(data)
                set_progress(
                    job_id,
                    percent=10 + int(percent * 0.45),
                    message=f"DMR: {message}",
                )

        dmr_result = await run_r_script(
            command=DmrAnalysisCommand(
                script="dmr.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet=sample_sheet_name,
                extra_args=["beta.rds", "3", "NULL", str(adj_pval), "1000", array_type, "10", "1"],
            ),
            cancel_event=cancel_event,
            on_progress=on_dmr_progress,
        )

        if dmr_result.is_cancelled:
            logger.info("DMR-Analyse abgebrochen: job_id=%s", job_id)
            return

        if not dmr_result.is_success:
            raise RuntimeError(_failure_detail(dmr_result, "Das DMR-Skript hat einen Fehler gemeldet."))

        logger.info("DMR-Analyse erfolgreich: job_id=%s", job_id)

        # DMP-Analyse
        logger.info("Starte DMP-Analyse (dmp.R): job_id=%s", job_id)

        async def on_dmp_progress(data: dict) -> None:
            if data.get("type") == "progress":
                percent, message = _progress_fields(data)
                set_progress(
                    job_id,
                    percent=55 + int(percent * 0.43),
                    message=f"DMP: {message}",
                )

        dmp_result = await run_r_script(
            command=DmpAnalysisCommand(
                script="dmp.R",
                job_id=job_id,
                job_dir=str(job_dir),
                sample_sheet=sample_sheet_name,
                extra_args=["beta.rds", str(adj_pval), array_type],
            ),
            cancel_event=cancel_event,
            on_progress=on_dmp_progress,
        )

        if dmp_result.is_cancelled:
            logger.info("DMP-Analyse abgebrochen: job_id=%s", job_id)
            return

        if not dmp_result.is_success:
            raise RuntimeError(_failure_detail(dmp_result, "Das DMP-Skript hat einen Fehler gemeldet."))

        logger.info("DMP-Analyse erfolgreich: job_id=%s", job_id)

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
        logger.info("Downstream-Analyse abgeschlossen: job_id=%s", job_id)

    except Exception as e:
        logger.exception("Fehler in der Downstream-Analyse: job_id=%s", job_id)
        transition_job(
            job_id,
            new_phase=JobPhase.ANALYSIS,
            new_status=JobStatusValue.FAILED,
            current_step=f"Fehler in der Analyse: {str(e)}",
            error={"detail": str(e)},
        )