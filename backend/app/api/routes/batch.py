# app/api/routes/batch.py
from fastapi import APIRouter, Request, status
from fastapi.responses import FileResponse

from app.core.error_types import BatchException, ErrorTypes, problem_detail
from app.models.batch import (
    BatchHistoryResponse, BatchRunResponse,
    BatchSkipResponse, BatchSettingsPayload,
    BatchOptionsResponse,
)
from app.services import batch_service, job_manager
from app.services.job_manager import transition_job, JobPhase, JobStatusValue
from app.services.pipeline_task import start_job_pipeline

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
async def run_batch_correction(
    job_id: str,
    payload: BatchSettingsPayload,
    request: Request,
):
    job_dir  = batch_service.get_job_dir_or_404(job_id)
    settings = payload.batch_correction

    available_cols = batch_service.get_available_columns_from_samplesheet(job_dir)
    if settings.batch_variable not in available_cols:
        raise BatchException(
            ErrorTypes.INVALID_BATCH_VARIABLE,
            detail=f"Spalte '{settings.batch_variable}' nicht im SampleSheet.",
            provided=settings.batch_variable,
            available=available_cols,
        )

    current_job = job_manager.get_job(job_id)
    if current_job and current_job.status == JobStatusValue.RUNNING.value:
        raise BatchException(
            ErrorTypes.BATCH_NOT_ALLOWED,
            detail="Eine Pipeline läuft bereits für diesen Job.",
        )

    if settings.batch_variable in settings.covariates:
        raise BatchException(
            ErrorTypes.COVARIATE_EQUALS_BATCH,
            detail="Die Batch-Variable darf nicht gleichzeitig als Kovariate verwendet werden.",
            provided_batch_variable=settings.batch_variable,
            provided_covariates=settings.covariates,
        )

    # Removing the analysis phenotype as a "batch effect" would erase the very
    # group difference DMP/DMR test for, producing empty downstream results.
    if settings.batch_variable == batch_service.PHENOTYPE_COLUMN:
        raise BatchException(
            ErrorTypes.INVALID_BATCH_VARIABLE,
            detail=(
                f"'{batch_service.PHENOTYPE_COLUMN}' ist die Vergleichsgruppe der "
                "Downstream-Analyse (DMP/DMR) und darf nicht als Batch-Variable entfernt "
                "werden — das würde genau das biologische Signal löschen, das die Analyse "
                "sucht. Wähle eine technische Variable (z. B. Sentrix_ID/Sentrix_Position) "
                f"als Batch-Variable und '{batch_service.PHENOTYPE_COLUMN}' höchstens als "
                "zu schützende Kovariate."
            ),
            provided=settings.batch_variable,
        )

    history_data = batch_service.load_history(job_dir, job_id)
    next_round   = batch_service.next_correction_round(history_data)

    try:
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step="Starte Batch-Korrektur...",
        )
    except Exception as e:
        raise BatchException(
            ErrorTypes.INVALID_STATE_TRANSITION,
            detail=str(e),
        )

    settings_dict = settings.model_dump()

    start_job_pipeline(
        job_id,
        lambda cancel_event: batch_service.run_batch_pipeline_task(
            job_id, settings_dict, next_round, job_dir, cancel_event
        ),
    )

    return {"job_id": job_id, "status": JobStatusValue.RUNNING.value, "round": next_round}


@router.post("/{job_id}/skip", status_code=status.HTTP_202_ACCEPTED, response_model=BatchSkipResponse)
async def skip_batch_correction(job_id: str):
    job_dir = batch_service.get_job_dir_or_404(job_id)

    # "Proceed to analysis" entry point. If a batch correction has already run
    # (corrected_data.rds exists), analyse the corrected data; otherwise fall
    # back to the uncorrected normalized data.
    has_correction = (job_dir / "corrected_data.rds").exists()
    step = (
        "Starte Downstream-Analyse mit batch-korrigierten Daten..."
        if has_correction
        else "Batch-Korrektur übersprungen. Starte Downstream-Analyse..."
    )

    transition_job(
        job_id,
        new_phase=JobPhase.ANALYSIS,
        new_status=JobStatusValue.RUNNING,
        progress_percent=0,
        current_step=step,
    )

    start_job_pipeline(
        job_id,
        lambda cancel_event: batch_service.run_downstream_analysis_task(
            job_id,
            str(job_dir),
            cancel_event,
            extract_from_normalized=not has_correction,
        ),
    )

    return {"job_id": job_id, "status": JobStatusValue.RUNNING.value}


@router.get("/{job_id}/batch-options", response_model=BatchOptionsResponse)
def get_batch_options(job_id: str):
    job_dir        = batch_service.get_job_dir_or_404(job_id)
    available_cols = batch_service.get_available_columns_from_samplesheet(job_dir)
    return {"job_id": job_id, "available_columns": available_cols}