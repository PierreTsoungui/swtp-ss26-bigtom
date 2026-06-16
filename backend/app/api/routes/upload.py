# app/api/routes/upload.py
import uuid
import json
from pathlib import Path
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Request, Form
from pydantic import ValidationError

from app.core.error_types import ErrorTypes, problem_detail
from app.models.job import UploadResponse, FilterSettings
from app.services.normalization_preview_service import run_normalization_preview
from app.services.job_manager import (
    create_job, get_job,
    transition_job, set_progress,
    JobPhase, JobStatusValue,
)
from app.services.file_handler import (
    ensure_upload_dir,
    save_idat_files,
    save_sample_sheet,
    save_filter_settings,
    validate_idat_files,
    validate_sample_sheet,
    clean_job_files,
)
from app.services.r_executor import run_r_script


router = APIRouter()

JOBS_DIR = Path("jobs").resolve()


# ── Upload-Endpunkt ───────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_files(
    request: Request,
    background_tasks: BackgroundTasks,
    idat_files: List[UploadFile] = File(...),
    sample_sheet: UploadFile = File(...),
    filter_settings: str = Form(None),
):
    # Datei-Validierung
    idat_valid, idat_result = validate_idat_files(idat_files)
    if not idat_valid:
        raise HTTPException(
            status_code=idat_result["status"],
            detail={
                "type":     idat_result["type"],
                "title":    idat_result["title"],
                "status":   idat_result["status"],
                "detail":   idat_result["message"],
                "instance": request.url.path,
                **{k: v for k, v in idat_result.items()
                   if k not in ["error", "message", "type", "title", "status"]},
            },
        )

    sheet_valid, sheet_result = validate_sample_sheet(sample_sheet)
    if not sheet_valid:
        raise HTTPException(
            status_code=sheet_result["status"],
            detail={
                "type":     sheet_result["type"],
                "title":    sheet_result["title"],
                "status":   sheet_result["status"],
                "detail":   sheet_result["message"],
                "instance": request.url.path,
                **{k: v for k, v in sheet_result.items()
                   if k not in ["error", "message", "type", "title", "status"]},
            },
        )

    # Filter-Settings parsen
    if filter_settings is not None and filter_settings.strip():
        try:
            parsed_filter = json.loads(filter_settings)["filter_settings"]
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=ErrorTypes.INVALID_FILTER_JSON.status,
                detail=problem_detail(
                    ErrorTypes.INVALID_FILTER_JSON,
                    f"Fehler beim Parsen von filter_settings: {e}",
                    request.url.path,
                ),
            )
        except KeyError:
            raise HTTPException(
                status_code=400,
                detail=problem_detail(
                    ErrorTypes.INVALID_FILTER_JSON,
                    'filter_settings fehlt im Request-Body. Erwartet: {"filter_settings": {...}}',
                    request.url.path,
                ),
            )
        try:
            filter_settings_model = FilterSettings.model_validate(parsed_filter)
        except ValidationError as e:
            raise HTTPException(
                status_code=400,
                detail=problem_detail(ErrorTypes.INVALID_FILTER_PARAM, str(e), request.url.path),
            )
    else:
        filter_settings_model = FilterSettings()

    # Dateien speichern
    job_id  = str(uuid.uuid4())
    job_dir = ensure_upload_dir(job_id)

    try:
        save_idat_files(idat_files, job_dir)
        save_sample_sheet(sample_sheet, job_dir)
        save_filter_settings(filter_settings_model.model_dump(), job_dir)
    except ValueError as e:
        clean_job_files(job_id)
        raise HTTPException(
            status_code=400,
            detail={"type": "/errors/invalid-upload", "title": "Invalid upload",
                    "status": 400, "detail": str(e), "instance": request.url.path},
        )
    except HTTPException:
        raise
    except Exception as e:
        clean_job_files(job_id)
        raise HTTPException(
            status_code=500,
            detail={"type": "/errors/save-failed", "title": "Save failed",
                    "status": 500, "detail": f"Fehler beim Speichern: {e}",
                    "instance": request.url.path},
        )

    # Job anlegen und Upload als completed markieren, dann direkt Filtering starten
    create_job(job_id)
    transition_job(
        job_id,
        new_phase=JobPhase.UPLOADED,
        new_status=JobStatusValue.COMPLETED,
    )

    background_tasks.add_task(
        _process_upload_background,
        job_id,
        job_dir,
        "SampleSheet.csv",
        filter_settings_model,
    )

    return UploadResponse(
        job_id=job_id,
        status=JobStatusValue.WAITING.value,
        filter_settings=filter_settings_model.model_dump(),
    )


# ── Hintergrund-Task ─────────────────────────────────────────────────────────

async def _process_upload_background(
    job_id: str,
    job_dir: Path,
    sample_sheet_filename: str,
    filter_settings_model: FilterSettings,
) -> None:
    """Führt Filterung und anschließend Normalisierungs-Preview aus."""
    try:
        # Filtering starten
        transition_job(
            job_id,
            new_phase=JobPhase.FILTERING,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step="Starte Filterung der Rohdaten...",
        )

        async def on_progress(data: dict) -> None:
            if data.get("type") == "progress":
                set_progress(job_id, percent=data["percent"], message=data["message"])

        result = await run_r_script(
            script="init_filter.R",
            job_id=job_id,
            job_dir=str(job_dir),
            sample_sheet=sample_sheet_filename,
            script_args=[json.dumps(filter_settings_model.model_dump())],
            on_progress=on_progress,
        )

        if result["returncode"] != 0:
            job = get_job(job_id)
            # Wenn bereits durch emit_error auf failed gesetzt, nicht nochmal wechseln
            if job and job.status == JobStatusValue.FAILED.value:
                return
            transition_job(
                job_id,
                new_phase=JobPhase.FILTERING,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler während der Filterung.",
                error={"detail": result.get("stderr", "R-Skript mit Fehlercode beendet.")},
            )
            return

        # filter_stats.json prüfen — liegt als Datei vor, nicht im Job-Objekt
        stats_path = job_dir / "filter_stats.json"
        if not stats_path.exists():
            transition_job(
                job_id,
                new_phase=JobPhase.FILTERING,
                new_status=JobStatusValue.FAILED,
                current_step="Fehler: filter_stats.json wurde von R nicht erstellt.",
                error={"detail": "filter_stats.json fehlt nach Filterung."},
            )
            return

        # Filtering abschließen
        transition_job(
            job_id,
            new_phase=JobPhase.FILTERING,
            new_status=JobStatusValue.COMPLETED,
            progress_percent=100,
            current_step="Filterung abgeschlossen.",
        )
        print(f"[FILTERING] Job {job_id}: Filterung erfolgreich abgeschlossen.")

        # Normalisierungs-Preview direkt anschließen
        transition_job(
            job_id,
            new_phase=JobPhase.NORMALIZATION_PREVIEW,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step="Starte Normalisierungs-Preview...",
        )
        print(f"[PREVIEW] Job {job_id}: Starte Normalization Preview...")
        await run_normalization_preview(
            job_id, str(job_dir), str(job_dir / sample_sheet_filename)
        )
        print(f"[PREVIEW] Job {job_id}: Normalization Preview abgeschlossen.")

    except Exception as e:
        print(f"[FILTERING] Job {job_id}: Kritischer Fehler — {e}")
        job = get_job(job_id)
        current_phase = JobPhase(job.phase) if job else JobPhase.FILTERING
        transition_job(
            job_id,
            new_phase=current_phase,
            new_status=JobStatusValue.FAILED,
            current_step=f"Kritischer Systemfehler: {e}",
            error={"detail": str(e)},
        )