from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse
from pathlib import Path

from app.models.job import BatchRequest, BatchResponse
from app.services.batch_service import (
    get_sample_sheet_columns,
    run_batch_correction_background
)
from app.services.job_manager import get_job, update_job
from app.core.error_types import ErrorTypes, problem_detail

router = APIRouter()

@router.get("/batch/{job_id}/svd-plot")
async def get_batch_svd_plot(request: Request, job_id: str):
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

    if job.expires_at < request.url.path:  # placeholder check removed below
        pass

    if job.status not in ["normalization_done", "batch_correction", "batch_done", "completed"]:
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_NOT_ALLOWED,
                detail="Die Batch-Korrektur ist erst nach abgeschlossener Normalisierung verfügbar.",
                instance=request.url.path,
                job_id=job_id,
                current_status=job.status
            )
        )

    plot_path = Path(job.temp_dir) / "svd_plot.png"
    if not plot_path.exists():
        raise HTTPException(
            status_code=404,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_PLOT_MISSING,
                detail="SVD-Plot nicht gefunden.",
                instance=request.url.path,
                job_id=job_id
            )
        )

    return FileResponse(plot_path, media_type="image/png")

@router.post("/batch/{job_id}", response_model=BatchResponse, status_code=202)
async def start_batch_correction(
    request: Request,
    background_tasks: BackgroundTasks,
    job_id: str,
    body: BatchRequest
):
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

    if job.status != "normalization_done":
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_NOT_ALLOWED,
                detail="Batch-Korrektur kann erst nach abgeschlossener Normalisierung gestartet werden.",
                instance=request.url.path,
                job_id=job_id,
                current_status=job.status
            )
        )

    plot_path = Path(job.temp_dir) / "svd_plot.png"
    if not plot_path.exists():
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_PLOT_MISSING,
                detail="SVD-Plot existiert noch nicht. Bitte zuerst den Plot erzeugen.",
                instance=request.url.path,
                job_id=job_id
            )
        )

    try:
        columns = get_sample_sheet_columns(job.temp_dir)
    except FileNotFoundError:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_VARIABLE_INVALID,
                detail="Sample Sheet konnte nicht gefunden oder gelesen werden.",
                instance=request.url.path,
                job_id=job_id
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_VARIABLE_INVALID,
                detail=str(exc),
                instance=request.url.path,
                job_id=job_id
            )
        )

    if body.batch_variable not in columns:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_VARIABLE_INVALID,
                detail=f"'batch_variable' '{body.batch_variable}' ist nicht im Sample Sheet enthalten.",
                instance=request.url.path,
                job_id=job_id,
                allowed_columns=columns
            )
        )

    invalid_covariates = [name for name in body.covariates if name and name not in columns]
    if invalid_covariates:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_VARIABLE_INVALID,
                detail=f"Die folgenden Kovariaten sind nicht im Sample Sheet enthalten: {', '.join(invalid_covariates)}.",
                instance=request.url.path,
                job_id=job_id,
                allowed_columns=columns
            )
        )

    update_job(
        job_id,
        status="running",
        phase="batch_correction",
        progress_percent=0,
        current_step=f"Starte Batch-Korrektur für '{body.batch_variable}'..."
    )

    background_tasks.add_task(
        run_batch_correction_background,
        job_id,
        job.temp_dir,
        body.batch_variable,
        body.covariates,
    )

    return BatchResponse(
        job_id=job_id,
        status="running",
        batch_variable=body.batch_variable,
        covariates=body.covariates
    )

@router.post("/batch/{job_id}/skip", status_code=202)
async def skip_batch_correction(request: Request, job_id: str):
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

    if job.status != "normalization_done":
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.BATCH_NOT_ALLOWED,
                detail="Batch-Überspringen ist erst nach abgeschlossener Normalisierung möglich.",
                instance=request.url.path,
                job_id=job_id,
                current_status=job.status
            )
        )

    update_job(
        job_id,
        status="batch_done",
        phase="batch_correction",
        progress_percent=100,
        current_step="Batch-Korrektur übersprungen"
    )

    return {
        "job_id": job_id,
        "status": "batch_done",
        "skipped": True
    }
