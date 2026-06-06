import os
import shutil
from datetime import datetime
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request

from app.core.error_types import ErrorTypes, problem_detail
from app.models.job import NormalizeRequest, NormalizeResponse
from app.services.job_manager import get_job, update_job
from app.services.r_executor import run_r_script
from app.services.batch_service import find_sample_sheet_name

router = APIRouter()

# "raw" zu den erlaubten Methoden hinzufügen
VALID_METHODS = {"noob", "quantile", "swan", "funnorm", "raw"}


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
    - raw: Keine Normalisierung (Rohdaten direkt weiterverwenden)
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
        current_step=f"Starte Normalisierungsphase mit Methode '{method}'...",
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
    """Führt Normalisierung im Hintergrund aus und berechnet danach den initialen SVD-Plot (Runde 0)"""
    
    print(f"[DEBUG] run_normalization_background aufgerufen mit job_dir='{job_dir}'", flush=True)
    
    # 1. Callback für die Normalisierung (0% bis 100%)
    async def on_norm_progress(progress_data: dict):
        update_job(
            job_id,
            status="running",
            phase="normalizing",
            progress_percent=int(progress_data.get("percent", 0)),  # "percent" statt "progress"
            current_step=progress_data.get("message", "Normalisierung läuft...")  # "message" statt "step"
        )

    async def on_svd_progress(progress_data: dict):
        update_job(
            job_id,
            status="running",
            phase="normalizing",
            progress_percent=int(progress_data.get("percent", 0)),  # "percent" statt "progress"
            current_step=f"SVD-Analyse (Runde 0): {progress_data.get('message', 'Berechne Plot...')}"  # "message" statt "step"
        )
    
    try:
        # --- SCHRITT 1: NORMALISIERUNG ---
        if method == "raw":
            update_job(
                job_id,
                status="running",
                phase="normalizing",
                progress_percent=0,
                current_step="Nutze unkorrigierte Rohdaten. Kopiere Filter-Assets..."
            )
            
            filtered_file = os.path.join(job_dir, "filtered_data.rds")
            normalized_file = os.path.join(job_dir, "normalized_data.rds")
            
            if not os.path.exists(filtered_file):
                raise FileNotFoundError(f"Die gefilterten Rohdaten wurden unter '{filtered_file}' nicht gefunden.")
            
            shutil.copyfile(filtered_file, normalized_file)
            
            # Bei "raw" sind wir sofort fertig mit diesem Schritt
            update_job(
                job_id,
                status="running",
                phase="normalizing",
                progress_percent=100,
                current_step="Rohdaten erfolgreich bereitgestellt."
            )
            
        else:
            result = await run_r_script(
                script="normalize.R",
                job_id=job_id,
                job_dir=job_dir,
                sample_sheet="",
                mode="normalization",
                script_args=[method],
                on_progress=on_norm_progress # Nutzt den Normalisierungs-Callback
            )
            
            if result["returncode"] != 0:
                update_job(
                    job_id,
                    status="failed",
                    phase="normalizing",
                    error_message=result.get("stderr", "Normalisierung fehlgeschlagen")
                )
                return
        
        # --- SCHRITT 2: SVD-PLOT GENERIEREN ---
        round_zero_file = "svd_plot_0.png"
        
        # Initialer Reset auf 0% für den SVD-Start
        update_job(
            job_id,
            status="running",
            phase="normalizing",
            progress_percent=0,
            current_step="Normalisierung abgeschlossen. Starte SVD-Plot-Generierung (Runde 0)..."
        )
        
        from app.services.batch_service import find_sample_sheet_name
        try:
            sample_sheet_name = find_sample_sheet_name(job_dir)
        except Exception as sheet_err:
            print(f"[DEBUG] Fehler bei find_sample_sheet_name: {str(sheet_err)}. Fallback.", flush=True)
            sample_sheet_name = "sample_sheet.csv"
        
        svd_args = ["normalized_data.rds", sample_sheet_name, round_zero_file]
        
        svd_result = await run_r_script(
            script="batch_svd.R",  
            job_id=job_id,
            job_dir=job_dir,
            sample_sheet="",
            mode="batch_init",
            script_args=svd_args,
            on_progress=on_svd_progress # JETZT MIT CALLBACK!
        )
        
        if svd_result["returncode"] != 0:
            update_job(
                job_id,
                status="failed",
                phase="normalizing",
                error_message=svd_result.get("stderr", "SVD-Plot-Generierung für Runde 0 fehlgeschlagen")
            )
            return

        # --- SCHRITT 3: BATCH-HISTORIE ---
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
            current_step="Normalisierungsphase abgeschlossen. Bereit für Batch-Effekt-Korrektur.",
            batch_history={"rounds": [initial_round]}
        )
        
    except Exception as e:
        update_job(
            job_id,
            status="failed",
            phase="normalizing",
            error_message=str(e)
        )