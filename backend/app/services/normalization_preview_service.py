import asyncio
from app.services.job_manager import get_job, update_job
from app.services.r_executor import run_r_script
from pathlib import Path

async def run_normalization_preview(job_id: str, job_dir: str, sample_sheet_path: str):
    print(f"[PREVIEW] ====== START run_normalization_preview für {job_id} ======")

    job = get_job(job_id)
    if not job:
        return

    try:
        update_job(
            job_id,
            status="running",
            phase="normalization_preview",
            progress_percent=0,
            current_step="Starte normalization_preview..."
        )

        async def on_progress(data):
            if data.get("type") == "progress":
                update_job(
                    job_id,
                    status="running",
                    phase="normalization_preview",
                    progress_percent=data["percent"],
                    current_step=data["message"]
                )
            elif data.get("status") == "failed":
                update_job(
                    job_id,
                    status="failed",
                    phase="normalization_preview",
                    current_step=data.get("current_step"),
                    error=data.get("error")
                )

        result = await run_r_script(
            script="normalization_preview.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet=sample_sheet_path,
            mode="normalization_preview",
            on_progress=on_progress
        )

        if result["returncode"] != 0:
            update_job(
                job_id,
                status="failed",
                phase="normalization_preview",
                progress_percent=0,
                error_message=result.get("stderr", "Unknown error")
            )
            return

        job_path = Path(job_dir)
        preview_plots = {}

        for png_file in sorted(job_path.glob("*.png")):
            filename = png_file.name
            parts = filename.replace(".png", "").split("_", 1)
            if len(parts) != 2:
                continue
            plot_kind = parts[0]
            method    = parts[1]
            if method not in preview_plots:
                preview_plots[method] = []
            preview_plots[method].append({
                "plot_kind": plot_kind,
                "file": filename
            })

        print(f"[PREVIEW] Gefundene Plots: {preview_plots}", flush=True)

        if len(preview_plots) < 1:
            update_job(
                job_id,
                status="failed",
                phase="normalization_preview",
                error_message=f"Keine Plots im Verzeichnis {job_dir} gefunden"
            )
            return

        update_job(
            job_id,
            status="waiting",
            phase="waiting_selection",
            progress_percent=100,
            current_step="Preview completed - waiting for selection",
            preview_plots=preview_plots
        )

    except Exception as e:
        print(f"[PREVIEW] Exception: {e}")
        update_job(
            job_id,
            status="failed",
            phase="normalization_preview",
            progress_percent=0,
            error_message=str(e)
        )