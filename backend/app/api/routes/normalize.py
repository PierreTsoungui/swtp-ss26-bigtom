
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from app.services.job_manager import get_job, update_job
from app.services.r_executor import run_r_script
from app.core.error_types import ErrorTypes, problem_detail
from app.models.job import NormalizeRequest, NormalizeResponse
from datetime import datetime
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
    """Führt Normalisierung im Hintergrund aus"""
    
    async def on_progress(progress_data: dict):
        update_job(
            job_id,
            status="running",
            phase="normalizing",
            progress_percent=progress_data.get("progress", 0),
            current_step=progress_data.get("step", "Normalisierung läuft...")
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
        
       
        update_job(
            job_id,
            status="normalization_done",
            phase="normalizing",
            progress_percent=100,
            current_step=f"Normalisierung mit {method} abgeschlossen"
        )
        
    except Exception as e:
        update_job(
            job_id,
            status="failed",
            phase="normalizing",
            error_message=str(e)
        )