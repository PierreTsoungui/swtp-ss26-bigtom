import asyncio



from app.services.job_manager import (
    get_job,
    update_job
)
from app.services.r_executor import run_r_script



# START PREVIEW (Background Task)
async def run_normalization_preview(job_id: str, job_dir: str):
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

        # Direkt output aus R nutzen 
        preview_plots = result.get("preview_plots", [])

        if len(preview_plots) < 5:
            update_job(
                job_id,
                status="failed",
                phase="normalization_preview",
                error_message=f"Not enough plots generated (expected 5, got {len(preview_plots)})"
            )
            return

        update_job(
            job_id,
            status="waiting",
            phase="waiting_selection",
            progress_percent=100,
            current_step="Preview completed - waiting for selection",
        )

        # keine File Check nötig
        job.preview_plots = preview_plots

    except Exception as e:
        print(f"[PREVIEW] Exception: {e}")
        update_job(
            job_id,
            status="failed",
            phase="normalization_preview",
            progress_percent=0,
            error_message=str(e)
        )