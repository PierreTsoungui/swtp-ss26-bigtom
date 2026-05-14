import asyncio
from typing import List

from app.services.job_manager import (
    get_job,
    update_job
)
from app.services.r_executor import run_r_script



# START PREVIEW (Background Task)

async def run_normalization_preview(job_id: str, job_dir: str):
    """
    Startet R-Skript für Normalization Preview
    Erwartet:
    - 5 PNG Plots im Job-Verzeichnis
    - Progress via stdout
    """

    job = get_job(job_id)

    if not job:
        return

    try:
       
        # STATUS UPDATE START

        update_job(
            job_id,
            status="running",
            phase="normalization_preview",
            progress_percent=0,
            current_step="Starting normalization preview..."
        )

        # R EXECUTION

        result = await run_r_script(
            script="normalization_preview.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="", 
            mode="normalization_preview",
            on_progress=lambda data: update_job(
                job_id,
                status="running",
                phase="normalization_preview",
                progress_percent=data.get("progress", 0),
                current_step=data.get("step", "")
            )
        )


        # ERROR HANDLING

        if result["returncode"] != 0:
            update_job(
                job_id,
                status="failed",
                phase="normalization_preview",
                progress_percent=0,
                error_message=result.get("stderr", "Unknown error")
            )
            return


        plots = result.get("preview_plots", [])

        # API CONTRACT: genau 5 Plots
        if len(plots) < 5:
            update_job(
                job_id,
                status="failed",
                phase="normalization_preview",
                error_message="Not enough plots generated (expected 5)"
            )
            return

        plots = plots[:5]

        # FINAL STATE

        update_job(
            job_id,
            status="waiting", 
            phase="waiting_selection",
            progress_percent=100,
            current_step="Preview completed - waiting for selection",
        )

        # store plots directly in job object (monkey patch safe approach)
        job.preview_plots = plots

    except Exception as e:
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