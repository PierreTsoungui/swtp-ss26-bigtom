import asyncio
from typing import List
from pathlib import Path

from app.services.job_manager import (
    get_job,
    update_job
)
from app.services.r_executor import run_r_script



# START PREVIEW (Background Task)

async def run_normalization_preview(job_id: str, job_dir: str):
    job = get_job(job_id)
    if not job:
        return

    try:
        update_job(
            job_id,
            status="running",
            phase="normalization_preview",
            progress_percent=0,
            current_step="Starting normalization preview..."
        )

        async def on_progress(data):
            update_job(
                job_id,
                status="running",
                phase="normalization_preview",
                progress_percent=data.get("progress", 0),
                current_step=data.get("step", "")
            )

        result = await run_r_script(
            script="normalization_preview.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
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

        # Container-Pfad für die Prüfung verwenden
        docker_job_dir = Path(f"/app/jobs/{job_id}")
        plot_names = ["norm_raw.png", "norm_noob.png", "norm_quantile.png",
                      "norm_swan.png", "norm_funnorm.png"]
        plots = [name for name in plot_names if (docker_job_dir / name).exists()]

        if len(plots) < 5:
            update_job(
                job_id,
                status="failed",
                phase="normalization_preview",
                error_message=f"Not enough plots generated (expected 5, got {len(plots)})"
            )
            return

        update_job(
            job_id,
            status="waiting",
            phase="waiting_selection",
            progress_percent=100,
            current_step="Preview completed - waiting for selection",
        )
        job.preview_plots = plot_names

    except Exception as e:
        print(f"[PREVIEW] Exception: {e}")
        update_job(
            job_id,
            status="failed",
            phase="normalization_preview",
            progress_percent=0,
            error_message=str(e)
        )



# GET RESULT HELPERS

def get_preview_plots(job_id: str) -> List[str]:
    """
    Gibt Plot-URLs zurück (oder relative paths)
    """
    job = get_job(job_id)

    if not job:
        return []

    return getattr(job, "preview_plots", []) or []