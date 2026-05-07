# app/api/routes/upload.py
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from typing import List
from pathlib import Path
import uuid

from app.services.job_manager import create_job, update_job
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
        raise HTTPException(status_code=400, detail=idat_result)
    
    sheet_valid, sheet_result = validate_sample_sheet(sample_sheet)
    if not sheet_valid:
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
    Hintergrundverarbeitung - NUR DAS WAS IN DEINER USER STORY STEHT!
    """
    try:
        # Status: Verarbeitung startet
        update_job(
            job_id,
            status="running",
            phase="processing",  
            progress_percent=30,
            current_step="R-Skript verarbeitet Dateien..."
        )
        
       
        result = await run_r_script(
            script="process_data.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_filename
        )
        
        # R-Skript Fehler?
        if result["returncode"] != 0:
            update_job(
                job_id,
                status="failed",
                phase="failed",
                progress_percent=0,
                error_message=result["stderr"]
            )
            return
        
        # Erfolg - ABER: "completed" bedeutet hier nur,
        # dass das R-Skript durchgelaufen ist.
        # Die späteren Phasen (Normalisierung, etc.) kommen von anderen Stories!
        update_job(
            job_id,
            status="completed",  # oder "waiting"  wird später noch angepasst
            phase="completed",
            progress_percent=100,
            current_step="Dateien erfolgreich verarbeitet"
        )
        
    except Exception as e:
        update_job(
            job_id,
            status="failed",
            phase="failed",
            progress_percent=0,
            error_message=str(e)
        )