# app/services/normalization_preview_service.py
import json
from pathlib import Path

from app.services.job_manager import (
    get_job, transition_job, set_progress,
    JobPhase, JobStatusValue,
)
from app.services.r_executor import run_r_script


async def run_normalization_preview(job_id: str, job_dir: str, sample_sheet_path: str) -> None:
    """
    Führt das R-Skript zur Normalisierungs-Preview aus und speichert
    die gefundenen Plot-Metadaten als preview_plots.json im Job-Verzeichnis.
    """
    print(f"[PREVIEW] ====== START run_normalization_preview für {job_id} ======")

    job = get_job(job_id)
    if not job:
        return

    try:
        # Preview läuft bereits als RUNNING (gesetzt vom upload-Background-Task)
        set_progress(job_id, percent=0, message="Starte Normalisierungs-Preview...")

        async def on_progress(data: dict) -> None:
            if data.get("type") == "progress":
                set_progress(job_id, percent=data["percent"], message=data["message"])

        result = await run_r_script(
            script="normalization_preview.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet=sample_sheet_path,
            mode="normalization_preview",
            on_progress=on_progress,
        )

        if result["returncode"] != 0:
            transition_job(
                job_id,
                new_phase=JobPhase.NORMALIZATION_PREVIEW,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler während der Normalisierungs-Preview.",
                error={"detail": result.get("stderr", "normalization_preview.R mit Fehlercode beendet.")},
            )
            return

        # PNG-Dateien im Job-Verzeichnis einsammeln und als JSON speichern
        job_path     = Path(job_dir)
        preview_plots: dict = {}

        for png_file in sorted(job_path.glob("*.png")):
            filename = png_file.name
            parts    = filename.replace(".png", "").split("_", 1)
            if len(parts) != 2:
                continue
            plot_kind, method = parts[0], parts[1]
            if method not in preview_plots:
                preview_plots[method] = []
            preview_plots[method].append({"plot_kind": plot_kind, "file": filename})

        print(f"[PREVIEW] Gefundene Plots: {preview_plots}", flush=True)

        if not preview_plots:
            transition_job(
                job_id,
                new_phase=JobPhase.NORMALIZATION_PREVIEW,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler: Keine Plots im Job-Verzeichnis gefunden.",
                error={"detail": f"Keine PNG-Dateien in {job_dir} gefunden."},
            )
            return

        # Plots als Datei persistieren — nicht im Job-Objekt speichern
        plots_path = job_path / "preview_plots.json"
        with open(plots_path, "w", encoding="utf-8") as f:
            json.dump(preview_plots, f, indent=2)

        # Preview abschließen → Normalisierungs-Phase auf WAITING setzen
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Normalisierungs-Preview abgeschlossen.",
        )
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION,
            new_status=JobStatusValue.WAITING,
            current_step="Warte auf Auswahl der Normalisierungsmethode...",
        )

    except Exception as e:
        print(f"[PREVIEW] Exception: {e}", flush=True)
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.FAILED,
            current_step=f"Kritischer Fehler: {e}",
            error={"detail": str(e)},
        )