# app/api/routes/upload.py
from app.models import job
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from typing import List
from pathlib import Path
import uuid

from app.services.job_manager import create_job, get_job, save_filter_stats, update_job
from app.services.file_handler import (
    ensure_upload_dir,
    save_idat_files,
    save_sample_sheet,
    validate_idat_files,
    validate_sample_sheet,
    clean_job_files
)
from app.services.r_executor import run_r_script
from app.models.job import UploadResponse

router = APIRouter()


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_files(
    background_tasks: BackgroundTasks,
    idat_files: List[UploadFile] = File(...),
    sample_sheet: UploadFile = File(...)
):
    # Validierung
    idat_valid, idat_result = validate_idat_files(idat_files)
    if not idat_valid:
        print(f"[DEBUG] IDAT Validierung fehlgeschlagen: {idat_result}")
        raise HTTPException(status_code=400, detail=idat_result)
    
    sheet_valid, sheet_result = validate_sample_sheet(sample_sheet)
    if not sheet_valid:
        print(f"[DEBUG] Sample Sheet Validierung fehlgeschlagen: {sheet_result}")
        raise HTTPException(status_code=415, detail=sheet_result)
    
    # Job erstellen
    job_id = str(uuid.uuid4())
    job_dir = ensure_upload_dir(job_id)
    
    try:
        save_idat_files(idat_files, job_dir)
        save_sample_sheet(sample_sheet, job_dir)
    except Exception as e:
        clean_job_files(job_id)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "SAVE_FAILED",
                "message": f"Fehler beim Speichern der Dateien: {str(e)}"
            }
        )
    
    
    create_job(job_id, str(job_dir))  
    
    # Hintergrundtask starten
    background_tasks.add_task(
        process_upload_background,
        job_id,
        job_dir,
        sample_sheet.filename
    )
    
    return UploadResponse(job_id=job_id, status="queued")


async def process_upload_background(job_id: str, job_dir: Path, sample_sheet_filename: str):
    """
    Hintergrundverarbeitung für die Filterung.
    Status-Wechsel: filtering → filtering_done → oder failed
    """
    
    
    # Callback für Fortschritts-Updates aus R

    async def on_progress(progress_data: dict):
        """Wird von r_executor bei jeder Progress-Meldung aufgerufen"""
        update_job(
            job_id,
            status="running",
            phase="filtering",
            progress_percent=progress_data["progress"],
            current_step=progress_data["step"]
        )
        print(f"[FILTERING] Job {job_id}: {progress_data['progress']}% - {progress_data['step']}")
    
    try:
      
        update_job(
            job_id,
            status="running",
            phase="filtering",
            progress_percent=0,
            current_step="Starte Filterung der Rohdaten..."
        )
        
      
        result = await run_r_script(
            script="mock_filtering.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_filename,
            on_progress=on_progress  
        )
        
       
        if result["returncode"] != 0:
            update_job(
                job_id,
                status="failed",
                phase="filtering",
                progress_percent=get_job(job_id).progress_percent,
                error_message=result["stderr"]
            )
            return
        
       
        # Filter-Statistiken aus Return holen
       
        filter_stats = result.get("filter_stats", {})
        
        # Im Job-Manager speichern (für GET /filter/.../stats) für die Schnellzugriffe
        if filter_stats:
            save_filter_stats(job_id, filter_stats)
        
       
        update_job(
            job_id,
            status="filtering_done",
            phase="filtering",
            progress_percent=get_job(job_id).progress_percent,
            current_step="Filterung abgeschlossen",
            filter_stats=filter_stats
        )
        
        print(f"[FILTERING] Job {job_id}: Filterung erfolgreich abgeschlossen")
        
    except Exception as e:
       
        update_job(
            job_id,
            status="failed",
            phase="filtering",
            progress_percent=get_job(job_id).progress_percent,
            error_message=str(e)
        )
        print(f"[FILTERING] Job {job_id}: Fehler - {str(e)}")