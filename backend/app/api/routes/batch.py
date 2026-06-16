# app/api/routes/batch.py
from fastapi import APIRouter, BackgroundTasks, status
from fastapi.responses import FileResponse

from app.core.error_types import BatchException, ErrorTypes
from app.models.batch import (
    BatchHistoryResponse, BatchRunResponse,
    BatchSkipResponse, BatchSettingsPayload,
    BatchOptionsResponse,
)
from app.services import batch_service, job_manager
from app.services.job_manager import transition_job, JobPhase, JobStatusValue

router = APIRouter()


@router.get("/{job_id}/history", response_model=BatchHistoryResponse)
def get_batch_history(job_id: str):
    job_dir      = batch_service.get_job_dir_or_404(job_id)
    history_data = batch_service.load_history(job_dir, job_id)
    return history_data


@router.get("/{job_id}/svd-plot/{round_id}")
def get_svd_plot(job_id: str, round_id: int):
    job_dir   = batch_service.get_job_dir_or_404(job_id)
    plot_file = job_dir / f"svd_plot_{round_id}.png"

    if not plot_file.exists():
        raise BatchException(
            ErrorTypes.PLOT_NOT_FOUND,
            detail=f"SVD-Plot für Runde {round_id} nicht gefunden.",
        )

    return FileResponse(plot_file, media_type="image/png")


@router.post("/{job_id}", status_code=status.HTTP_202_ACCEPTED, response_model=BatchRunResponse)
def run_batch_correction(
    job_id: str,
    payload: BatchSettingsPayload,
    background_tasks: BackgroundTasks,
):
    job_dir  = batch_service.get_job_dir_or_404(job_id)
    settings = payload.batch_correction

    # Batch-Variable gegen SampleSheet validieren
    available_cols = batch_service.get_available_columns_from_samplesheet(job_dir)
    if settings.batch_variable not in available_cols:
        raise BatchException(
            ErrorTypes.INVALID_BATCH_VARIABLE,
            detail=f"Spalte '{settings.batch_variable}' nicht im SampleSheet.",
            provided=settings.batch_variable,
            available=available_cols,
        )

    # Parallelstart verhindern
    current_job = job_manager.get_job(job_id)
    if current_job and current_job.status == JobStatusValue.RUNNING.value:
        raise BatchException(
            ErrorTypes.BATCH_NOT_ALLOWED,
            detail="Eine Pipeline läuft bereits für diesen Job.",
        )

    # Batch-Variable darf nicht gleichzeitig Kovariate sein
    if settings.batch_variable in settings.covariates:
        raise BatchException(
            ErrorTypes.COVARIATE_EQUALS_BATCH,
            detail="Die Batch-Variable darf nicht gleichzeitig als Kovariate verwendet werden.",
            provided_batch_variable=settings.batch_variable,
            provided_covariates=settings.covariates,
        )

    # Nächste Runden-Nummer
    history_data = batch_service.load_history(job_dir, job_id)
    next_round   = history_data.get("current_round", 1) + 1

    # Batch-Phase starten
    try:
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step="Starte Batch-Korrektur...",
        )
    except ValueError as e:
        raise HTTPException(
            status_code=409,
            detail=problem_detail(
                error_type=ErrorTypes.INVALID_JOB_STATE,
                detail=str(e),
                instance=request.url.path,
                job_id=job_id,
                current_phase=job.phase,
                current_status=job.status,
            ),
        )

    background_tasks.add_task(
        batch_service.run_batch_pipeline_task,
        job_id,
        settings.model_dump(),
        next_round,
        job_dir,
    )

    return {"job_id": job_id, "status": JobStatusValue.RUNNING.value, "round": next_round}


@router.post("/{job_id}/skip", status_code=status.HTTP_202_ACCEPTED, response_model=BatchSkipResponse)
def skip_batch_correction(job_id: str, background_tasks: BackgroundTasks):
    job_dir = batch_service.get_job_dir_or_404(job_id)

    current_job = job_manager.get_job(job_id)

    # Direkt zu Analysis springen (Batch überspringen)
    transition_job(
        job_id,
        new_phase=JobPhase.ANALYSIS,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step="Batch-Korrektur übersprungen. Starte Downstream-Analyse...",
    )

    background_tasks.add_task(
        batch_service.run_downstream_analysis_workflow,
        job_id,
        str(job_dir),
        extract_from_normalized=True,
    )

    return {"job_id": job_id, "status": JobStatusValue.RUNNING.value}


@router.get("/{job_id}/batch-options", response_model=BatchOptionsResponse)
def get_batch_options(job_id: str):
    job_dir        = batch_service.get_job_dir_or_404(job_id)
    available_cols = batch_service.get_available_columns_from_samplesheet(job_dir)
    return {"job_id": job_id, "available_columns": available_cols}