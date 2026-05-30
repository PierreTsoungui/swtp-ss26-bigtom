# app/api/routes/batch.py
from fastapi import APIRouter, BackgroundTasks, status
from fastapi.responses import FileResponse

# WICHTIG: ErrorTypes mitimportieren!
from app.core.error_types import BatchException, ErrorTypes
from app.models.batch import (
    BatchHistoryResponse, BatchRunResponse, 
    BatchSkipResponse, BatchSettingsPayload
)
from app.services import batch_service, job_manager

router = APIRouter()


@router.get("/{job_id}/history", response_model=BatchHistoryResponse)
def get_batch_history(job_id: str):
    job_dir = batch_service.get_job_dir_or_404(job_id)
    history_data = batch_service.load_history(job_dir, job_id)
    return history_data


@router.get("/{job_id}/svd-plot/{round_id}")
def get_svd_plot(job_id: str, round_id: int):
    job_dir = batch_service.get_job_dir_or_404(job_id)
    plot_file = job_dir / f"svd_plot_{round_id}.png"
    
    if not plot_file.exists():
        # HIER WAR DER FEHLER: Jetzt sauber nach RFC 9457
        raise BatchException(
            ErrorTypes.PLOT_NOT_FOUND,
            detail=f"SVD-Plot not found for Round {round_id}."
        )
    
    return FileResponse(plot_file, media_type="image/png")


@router.post("/{job_id}", status_code=status.HTTP_202_ACCEPTED, response_model=BatchRunResponse)
def run_batch_correction(job_id: str, payload: BatchSettingsPayload, background_tasks: BackgroundTasks):
    job_dir = batch_service.get_job_dir_or_404(job_id)
    settings = payload.batch_correction
    
    # Validierung gegen das Samplesheet
    available_cols = batch_service.get_available_columns_from_samplesheet(job_dir)
    if settings.batch_variable not in available_cols:
        raise BatchException(
            ErrorTypes.INVALID_BATCH_VARIABLE,
            detail=f"Column '{settings.batch_variable}' not found in SampleSheet.",
            provided=settings.batch_variable,
            available=available_cols
        )
        
    # Batch-Task darf nicht mehrfach parallel gestartet werden
    current_job = job_manager.get_job(job_id)
    if current_job and current_job.status == "running":
        raise BatchException(
            ErrorTypes.BATCH_NOT_ALLOWED,
            detail="A batch-related workflow is already running for this job."
        )

    # Identische Variablen verhindern
    if settings.batch_variable in settings.covariates:
        raise BatchException(
            ErrorTypes.COVARIATE_EQUALS_BATCH,
            detail="The batch variable cannot be used as a covariate at the same time.",
            provided_batch_variable=settings.batch_variable,
            provided_covariates=settings.covariates
        )

    # Nächste Runden-Nummer bestimmen
    history_data = batch_service.load_history(job_dir, job_id)
    next_round = history_data.get("current_round", 1) + 1
    
    # Status auf running setzen & Pipeline starten
    batch_service.set_job_status(job_id, status_str="running", phase_str="batch_correction")
    background_tasks.add_task(
        batch_service.run_batch_pipeline_task, 
        job_id, 
        settings.model_dump(), 
        next_round, 
        job_dir
    )
    
    return {
        "job_id": job_id,
        "status": "running",
        "round": next_round
    }


@router.post("/{job_id}/skip", status_code=status.HTTP_202_ACCEPTED, response_model=BatchSkipResponse)
def skip_batch_correction(job_id: str, background_tasks: BackgroundTasks):
    # 1. Job-Verzeichnis holen oder 404 werfen
    job_dir = batch_service.get_job_dir_or_404(job_id)
    
    # 2. Status sofort auf "running" setzen, damit das Frontend weiß, es passiert was
    batch_service.set_job_status(job_id, status_str="running", phase_str="downstream_analysis")
    
    # 3. FIX: Über 'batch_service.' den Hintergrund-Task korrekt triggern
    background_tasks.add_task(batch_service.run_downstream_analysis_workflow, job_id, job_dir)
    
    # 4. Sofort dem Frontend antworten (HTTP 202)
    return {
        "job_id": job_id,
        "status": "running"
    }