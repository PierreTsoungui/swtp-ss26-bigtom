# app/services/normalization_preview_service.py
import asyncio
import json
import logging
from pathlib import Path

from app.services import job_manager
from app.services.job_manager import JobPhase, JobStatusValue
from app.services.r_executor import run_r_script, NormalizationPreviewCommand

logger = logging.getLogger(__name__)


def _scan_preview_artifacts(job_path: Path) -> dict[str, dict]:
    """Collect the per-method preview artifacts written by the R script.

    Returns ``{method: {"density": <png filename|None>, "pca": <json filename|None>}}``.
    Only the expected ``density_<method>.png`` and ``pca_<method>.json`` files are
    picked up, so unrelated files in the job dir (filter_settings.json,
    preview_plots.json, …) are ignored.
    """
    artifacts: dict[str, dict] = {}

    for png_file in sorted(job_path.glob("density_*.png")):
        method = png_file.stem[len("density_"):]
        artifacts.setdefault(method, {"density": None, "pca": None})["density"] = png_file.name

    for json_file in sorted(job_path.glob("pca_*.json")):
        method = json_file.stem[len("pca_"):]
        artifacts.setdefault(method, {"density": None, "pca": None})["pca"] = json_file.name

    return artifacts


async def run_normalization_preview(
    job_id: str,
    job_dir: str,
    sample_sheet: str,
    cancel_event: asyncio.Event,
) -> None:
    """
    Runs normalization_preview.R and persists preview_plots.json.

    The cancel_event is injected by the caller (it shares the job's pipeline
    cancel_event) rather than looked up from the registry — this keeps the
    data flow explicit and decoupled from global registry state.

    Plot detection scans the job directory for PNG files, which is more robust
    than stdout parsing because it works regardless of whether R emitted the
    plot JSON messages.
    """
    sample_sheet_name = Path(sample_sheet).name

    async def on_progress(data: dict) -> None:
        if data.get("type") == "progress":
            job_manager.set_progress(
                job_id,
                percent=data.get("percent", data.get("progress_percent", 0)),
                message=data.get("message", data.get("current_step", "")),
            )

    result = await run_r_script(
        command=NormalizationPreviewCommand(
            script="normalization_preview.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet=sample_sheet_name,
        ),
        cancel_event=cancel_event,
        on_progress=on_progress,
    )

    if result.is_cancelled:
        logger.info("Normalization preview cancelled: job_id=%s", job_id)
        return

    if result.is_timeout:
        logger.error("Normalization preview timed out: job_id=%s", job_id)
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler: R-Skript hat das Zeitlimit überschritten.",
            error={"detail": "Normalization preview timeout."},
        )
        return

    if not result.is_success:
        logger.error(
            "Normalization preview failed: job_id=%s returncode=%s stderr=%s",
            job_id, result.returncode, result.stderr[:500],
        )
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler während der Normalisierungs-Preview.",
            error={"detail": result.stderr or "R-Skript fehlgeschlagen."},
        )
        return

    # ── Plot-Erkennung: Dateisystem-Scan (primäre Strategie) ─────────────────
    # normalization_preview.R schreibt pro Methode zwei Artefakte:
    #   density_<method>.png  – server-gerenderter Dichteplot (statisch)
    #   pca_<method>.json     – PCA-Punkte für den interaktiven Frontend-Plotter
    # Beide werden hier eingesammelt, sodass das Frontend pro Methode den
    # Density-Plot anzeigen und die PCA dynamisch rendern kann.
    job_path = Path(job_dir)
    preview_plots = _scan_preview_artifacts(job_path)

    logger.info(
        "Preview-Scan abgeschlossen: job_id=%s methoden=%s",
        job_id,
        {m: {k: v for k, v in arts.items() if v} for m, arts in preview_plots.items()},
    )

    if not preview_plots:
        logger.error(
            "Keine Preview-Artefakte im Job-Verzeichnis: job_id=%s job_dir=%s",
            job_id, job_dir,
        )
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler: Keine Plots im Job-Verzeichnis gefunden.",
            error={"detail": f"Keine Preview-Dateien in {job_dir} gefunden."},
        )
        return

    # ── preview_plots.json persistieren ──────────────────────────────────────
    plots_path = job_path / "preview_plots.json"
    try:
        with open(plots_path, "w", encoding="utf-8") as f:
            json.dump(preview_plots, f, indent=2)
        logger.info(
            "preview_plots.json gespeichert: job_id=%s anzahl_plots=%d",
            job_id,
            sum(len(v) for v in preview_plots.values()),
        )
    except Exception:
        logger.exception("Fehler beim Speichern von preview_plots.json: job_id=%s", job_id)
        job_manager.transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.FAILED,
            current_step="Fehler beim Speichern der Preview-Plots.",
            error={"detail": "preview_plots.json konnte nicht gespeichert werden."},
        )
        return

    # ── Phasenübergänge ───────────────────────────────────────────────────────
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION_PREVIEW,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="Normalisierungs-Preview abgeschlossen.",
    )
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.NORMALIZATION,
        new_status=JobStatusValue.WAITING,
        current_step="Warte auf Auswahl der Normalisierungsmethode...",
    )