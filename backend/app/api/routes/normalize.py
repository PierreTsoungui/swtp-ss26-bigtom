
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from app.services.job_manager import get_job, update_job
from app.services.r_executor import run_r_script
from app.core.error_types import ErrorTypes, problem_detail
from app.models.job import NormalizeRequest, NormalizeResponse
from datetime import datetime
import glob
from pathlib import Path
router = APIRouter()


VALID_METHODS = {"noob", "quantile", "swan", "funnorm"}


@router.post("/normalize/{job_id}", response_model=NormalizeResponse, status_code=202)
async def start_normalization(
    request: Request,
    background_tasks: BackgroundTasks,
    job_id: str,
    body: NormalizeRequest
):
    """
    Startet die Normalisierung mit der gewählten Methode.
    
    - noob: Noob background correction
    - quantile: Quantile normalization
    - swan: SWAN normalization
    - funnorm: Functional normalization
    """
    
   
    job = get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=problem_detail(
                error_type=ErrorTypes.JOB_NOT_FOUND,
                detail=f"Kein Job mit der ID '{job_id}' gefunden",
                instance=request.url.path,
                job_id=job_id
            )
        )
    
    
    if job.expires_at < datetime.now():
        raise HTTPException(
            status_code=410,
            detail=problem_detail(
                error_type=ErrorTypes.SESSION_EXPIRED,
                detail="Die Sitzung ist abgelaufen",
                instance=request.url.path,
                job_id=job_id
            )
        )
    
    """
   # AUSKOMMENTIERT, DA NORMALISIERUNG NUR NACH FILTERUNG ERLAUBT SEIN SOLL


    if job.status != "waiting_selection":
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.NORMALIZATION_NOT_ALLOWED,  
                detail=f"Normalisierung kann erst nach abgeschlossener Filterung gestartet werden (aktuelle Phase: {job.phase})",
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase
            )
        )
    """
   
    method = body.method.lower()
    if method not in VALID_METHODS:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.INVALID_NORMALIZATION_METHOD,
                detail=f"Ungültige Normalisierungsmethode '{body.method}'. Erlaubt: {', '.join(VALID_METHODS)}",
                instance=request.url.path,
                job_id=job_id,
                provided_method=body.method,
                allowed_methods=list(VALID_METHODS)
            )
        )
    
   
    update_job(
        job_id,
        status="running",
        phase="normalizing",
        progress_percent=0,
        current_step=f"Starte Normalisierung mit Methode '{method}'...",
        normalization_method=method
    )
    
   
    background_tasks.add_task(
        run_normalization_background,
        job_id,
        job.temp_dir,
        method
    )
    
    return NormalizeResponse(
        job_id=job_id,
        status="normalizing",
        method=method
    )


async def run_normalization_background(job_id: str, job_dir: str, method: str):

    async def on_progress(data: dict):
        if data.get("type") == "progress":
            update_job(
                job_id,
                status="running",
                phase="normalizing",
                progress_percent=int(data["percent"] * 0.9),
                current_step=data["message"]
            )
        elif data.get("status") == "failed":
            update_job(
                job_id,
                status="failed",
                phase="normalizing",
                current_step=data.get("current_step"),
                error=data.get("error")
            )

    try:
        result = await run_r_script(
            script="normalize.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            mode="normalization",
            script_args=[method],
            on_progress=on_progress
        )

        if result["returncode"] != 0:
            update_job(
                job_id,
                status="failed",
                phase="normalizing",
                error_message=result.get("stderr", "Normalisierung fehlgeschlagen")
            )
            return

        round_zero_file = "svd_plot_0.png"
        update_job(
            job_id,
            status="running",
            phase="normalizing",
            progress_percent=95,
            current_step="Generiere initialen SVD-Plot (Runde 0)..."
        )

        sample_sheet_name = find_sample_sheet_name(job_dir)
        svd_args = ["normalized_data.rds", sample_sheet_name, round_zero_file]

        svd_result = await run_r_script(
            script="batch_svd.R",
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            mode="batch_init",
            script_args=svd_args,
            on_progress=None
        )

        if svd_result["returncode"] != 0:
            update_job(
                job_id,
                status="failed",
                phase="normalizing",
                error_message=svd_result.get("stderr", "SVD-Plot-Generierung fehlgeschlagen")
            )
            return

        initial_round = {
            "round_number": 0,
            "plot_file": round_zero_file,
            "batch_variable": None,
            "covariates": [],
            "timestamp": datetime.now().isoformat()
        }

        update_job(
            job_id,
            status="ready_for_batch",
            phase="batch_correction",
            progress_percent=100,
            current_step="Normalisierung abgeschlossen. Bereit für Batch-Effekt-Korrektur.",
            batch_history={"rounds": [initial_round]}
        )

    except Exception as e:
        update_job(
            job_id,
            status="failed",
            phase="normalizing",
            error_message=str(e)
        )

def find_sample_sheet_name(job_dir: str) -> str:
    matches = glob.glob(str(Path(job_dir) / "*SampleSheet*.csv"))
    if not matches:
        raise FileNotFoundError(f"Kein SampleSheet in {job_dir} gefunden")
    return Path(matches[0]).name