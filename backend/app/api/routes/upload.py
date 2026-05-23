# app/api/routes/upload.py

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Request, Form
from typing import List
from pathlib import Path
import uuid
import json

from pydantic import ValidationError
from app.core.error_types import ErrorTypes, problem_detail
from app.services.normalization_preview_service import run_normalization_preview
from app.services.job_manager import create_job, get_job, save_filter_stats, update_job
from app.services.file_handler import (
    ensure_upload_dir,
    save_idat_files,
    save_sample_sheet,
    save_filter_settings,
    validate_idat_files,
    validate_sample_sheet,
    clean_job_files
)
from app.services.r_executor import run_r_script
from app.models.job import UploadResponse, FilterSettings

router = APIRouter()


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_files(
    request: Request,
    background_tasks: BackgroundTasks,
    idat_files: List[UploadFile] = File(...),
    sample_sheet: UploadFile = File(...),
    filter_settings: str = Form(None)
):
    idat_valid, idat_result = validate_idat_files(idat_files)
    if not idat_valid:
        raise HTTPException(
            status_code=idat_result["status"],
            detail={
                "type": idat_result["type"],
                "title": idat_result["title"],
                "status": idat_result["status"],
                "detail": idat_result["message"],
                "instance": request.url.path,
                **{k: v for k, v in idat_result.items()
                   if k not in ["error", "message", "type", "title", "status"]}
            }
        )

    sheet_valid, sheet_result = validate_sample_sheet(sample_sheet)
    if not sheet_valid:
        raise HTTPException(
            status_code=sheet_result["status"],
            detail={
                "type": sheet_result["type"],
                "title": sheet_result["title"],
                "status": sheet_result["status"],
                "detail": sheet_result["message"],
                "instance": request.url.path,
                **{k: v for k, v in sheet_result.items()
                   if k not in ["error", "message", "type", "title", "status"]}
            }
        )

    job_id = str(uuid.uuid4())
    job_dir = ensure_upload_dir(job_id)

    # Optionales Filter-JSON parsen und validieren
    filter_settings_model = None

    if filter_settings is not None and filter_settings.strip() != "":

        # JSON string -> dict
        try:
            parsed_filter = json.loads(filter_settings)

            parsed_filter = parsed_filter["filter_settings"]

        except json.JSONDecodeError as e:
            clean_job_files(job_id)
            raise HTTPException(
                status_code=ErrorTypes.INVALID_FILTER_JSON.status,
                detail=problem_detail(
                    ErrorTypes.INVALID_FILTER_JSON,
                    f"Fehler beim Parsen von filter_settings: {str(e)}",
                    request.url.path,
                    job_id=job_id
                )
            )

        # VALIDATION
        filter_settings_model = FilterSettings.model_validate(parsed_filter)

    else:
        # Defaults
        filter_settings_model = FilterSettings()



    try:
        save_idat_files(idat_files, job_dir)
        save_sample_sheet(sample_sheet, job_dir)

        try:
            save_filter_settings(filter_settings_model.model_dump(), job_dir)

        except Exception as e:
            clean_job_files(job_id)
            raise HTTPException(
                status_code=500,
                detail={
                    "type": "/errors/save-failed",
                    "title": "Save failed",
                    "status": 500,
                    "detail": f"Fehler beim Speichern von filter_settings.json: {str(e)}",
                    "instance": request.url.path,
                    "job_id": job_id
                }
            )

    except Exception as e:
        clean_job_files(job_id)
        raise HTTPException(
            status_code=500,
            detail={
                "type": "/errors/save-failed",
                "title": "Save failed",
                "status": 500,
                "detail": f"Fehler beim Speichern: {str(e)}",
                "instance": request.url.path,
                "job_id": job_id
            }
        )


    # Job erstellen (IMMER)
    create_job(job_id, str(job_dir))


    # Background Task starten (IMMER)
    background_tasks.add_task(
        process_upload_background,
        job_id,
        job_dir,
        sample_sheet.filename
    )

    return UploadResponse(
        job_id=job_id,
        status="queued",
        filter_settings=filter_settings_model.model_dump()
    )

    # Callback für Fortschritts-Updates aus R
async def process_upload_background(job_id: str, job_dir: Path, sample_sheet_filename: str):
    """
    Hintergrundverarbeitung für die Filterung.
    """
    try:

        update_job(
            job_id,
            status="running",
            phase="filtering",
            progress_percent=0,
            current_step="Starte Filterung der Rohdaten..."
        )


        async def on_progress(progress_data: dict):
            update_job(
                job_id,
                status="running",
                phase="filtering",
                progress_percent=progress_data["progress"],
                current_step=progress_data["step"]
            )
            print(f"[FILTERING] Job {job_id}: {progress_data['progress']}% - {progress_data['step']}")


        result = await run_r_script(
            script="init_filter.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_filename,
            on_progress=on_progress
        )


        if result["returncode"] != 0:
            job = get_job(job_id)
            if job and job.status == "canceled":
                return
            update_job(
                job_id,
                status="failed",
                phase="filtering",
                progress_percent=job.progress_percent if job else 0,
                error_message=result["stderr"]
            )
            return


        stats_path = Path(job_dir) / "filter_stats.json"
        if not stats_path.exists():
            update_job(
                job_id,
                status="failed",
                phase="filtering",
                progress_percent=0,
                error_message="filter_stats.json wurde von R nicht erstellt"
            )
            return

        with open(stats_path, "r") as f:
            filter_stats = json.load(f)

        # Im Job-Manager speichern
        save_filter_stats(job_id, filter_stats)


        update_job(
            job_id,
            status="running",
            phase="filtering_done",
            progress_percent=100,
            current_step="Filterung abgeschlossen",
            filter_stats=filter_stats
        )

        print(f"[FILTERING] Job {job_id}: Filterung erfolgreich abgeschlossen")
          # NEU: Normalization Preview automatisch starten
        print(f"[PREVIEW] Job {job_id}: Starte Normalization Preview...")
        await run_normalization_preview(job_id, str(job_dir))
        print(f"[PREVIEW] Job {job_id}: Normalization Preview abgeschlossen")
    except Exception as e:
       
        update_job(
            job_id,
            status="failed",
            phase="filtering",
            progress_percent=0,
            error_message=str(e)
        )
        print(f"[FILTERING] Job {job_id}: Fehler - {str(e)}")
