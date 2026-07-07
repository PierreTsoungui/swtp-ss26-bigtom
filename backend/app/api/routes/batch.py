# app/api/routes/batch.py
"""Routes for batch correction, SVD plots and the downstream analysis run."""
from fastapi import APIRouter, Body, Query, Request, status
from fastapi.responses import FileResponse

from app.core.error_types import BatchException, ErrorTypes
from app.models.batch import (
    BatchHistoryResponse, BatchRunResponse,
    BatchSkipResponse, BatchSettingsPayload,
    BatchOptionsResponse, SampleSheetPreviewResponse,
    AnalysisStartRequest,
)
from app.services import batch_service, job_manager
from app.services.job_manager import transition_job, JobPhase, JobStatusValue
from app.services.pipeline_task import start_job_pipeline

router = APIRouter()


@router.get("/{job_id}/history", response_model=BatchHistoryResponse)
def get_batch_history(job_id: str):
    """Return the batch-correction history (rounds and current state) for a job."""
    job_dir      = batch_service.get_job_dir_or_404(job_id)
    history_data = batch_service.load_history(job_dir, job_id)
    return history_data


@router.get("/{job_id}/svd-plot/{round_id}")
def get_svd_plot(job_id: str, round_id: int, format: str = Query("png", pattern="^(png|pdf)$")):
    """Serve the static SVD heatmap for a round.

    ``format=png`` (default) is the raster image for inline display;
    ``format=pdf`` is the vector figure for publication, sent as a download.
    """
    job_dir = batch_service.get_job_dir_or_404(job_id)
    is_pdf  = format == "pdf"
    plot_file = job_dir / f"svd_plot_{round_id}.{'pdf' if is_pdf else 'png'}"

    if not plot_file.exists():
        raise BatchException(
            ErrorTypes.PLOT_NOT_FOUND,
            detail=f"SVD plot for round {round_id} not found.",
        )

    if is_pdf:
        return FileResponse(
            plot_file,
            media_type="application/pdf",
            filename=f"svd_plot_round_{round_id}.pdf",
        )
    return FileResponse(plot_file, media_type="image/png")


@router.get("/{job_id}/sample-sheet", response_model=SampleSheetPreviewResponse)
def get_sample_sheet_preview(job_id: str):
    """Tabular preview of the sample sheet so the biologist can assign roles."""
    job_dir = batch_service.get_job_dir_or_404(job_id)
    preview = batch_service.get_samplesheet_preview(job_dir)
    return {"job_id": job_id, **preview}


@router.post("/{job_id}", status_code=status.HTTP_202_ACCEPTED, response_model=BatchRunResponse)
async def run_batch_correction(
    job_id: str,
    payload: BatchSettingsPayload,
    request: Request,
):
    """Validate the batch settings and start a batch-correction run in the background."""
    job_dir  = batch_service.get_job_dir_or_404(job_id)
    settings = payload.batch_correction

    # Permissive by design: any column that groups the samples may be the batch
    # variable OR a covariate. The tool does not judge whether a choice is
    # biologically sensible (the biologist is responsible, guided by the SVD
    # plot) — it only enforces that the columns exist and the same column is not
    # used in both roles at once.
    available_cols = batch_service.get_available_columns_from_samplesheet(job_dir)

    if settings.batch_variable not in available_cols:
        raise BatchException(
            ErrorTypes.INVALID_BATCH_VARIABLE,
            detail=f"Column '{settings.batch_variable}' is not available as a variable in the sample sheet.",
            provided=settings.batch_variable,
            available=available_cols,
        )

    invalid_covariates = [c for c in settings.covariates if c not in available_cols]
    if invalid_covariates:
        raise BatchException(
            ErrorTypes.INVALID_COVARIATE,
            detail=f"Invalid covariate(s): {', '.join(invalid_covariates)}.",
            provided=invalid_covariates,
            available=available_cols,
        )

    if settings.batch_variable in settings.covariates:
        raise BatchException(
            ErrorTypes.COVARIATE_EQUALS_BATCH,
            detail="The batch variable must not also be used as a covariate.",
            provided_batch_variable=settings.batch_variable,
            provided_covariates=settings.covariates,
        )

    current_job = job_manager.get_job(job_id)
    if current_job and current_job.status == JobStatusValue.RUNNING.value:
        raise BatchException(
            ErrorTypes.BATCH_NOT_ALLOWED,
            detail="A pipeline is already running for this job.",
        )

    history_data = batch_service.load_history(job_dir, job_id)
    next_round   = batch_service.next_correction_round(history_data)

    try:
        transition_job(
            job_id,
            new_phase=JobPhase.BATCH,
            new_status=JobStatusValue.RUNNING,
            progress_percent=0,
            current_step="Starting batch correction...",
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
async def skip_batch_correction(
    job_id: str,
    payload: AnalysisStartRequest | None = Body(default=None),
):
    """Proceed to the DMP/DMR analysis.

    Carries the group selection (comparison column + case + control) chosen on the
    batch page; it is validated here and threaded into the analysis so Δβ is
    deterministic (case − control). The body is optional for backward
    compatibility (then R falls back to auto-detecting a 2-level column).
    """
    job_dir = batch_service.get_job_dir_or_404(job_id)

    group_column  = (payload.group_column or "") if payload else ""
    case_group    = (payload.case_group or "") if payload else ""
    control_group = (payload.control_group or "") if payload else ""
    if group_column:
        batch_service.validate_group_selection(job_dir, group_column, case_group, control_group)

    # If a batch correction has already run (corrected_data.rds exists), analyse
    # the corrected data; otherwise the uncorrected normalized data.
    has_correction = (job_dir / "corrected_data.rds").exists()
    step = (
        "Starting downstream analysis with batch-corrected data..."
        if has_correction
        else "Batch correction skipped. Starting downstream analysis..."
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
            group_column=group_column,
            case_group=case_group,
            control_group=control_group,
        ),
    )

    return {"job_id": job_id, "status": JobStatusValue.RUNNING.value}


@router.get("/{job_id}/batch-options", response_model=BatchOptionsResponse)
def get_batch_options(job_id: str):
    """Return the sample-sheet columns eligible as batch variable or covariate."""
    job_dir = batch_service.get_job_dir_or_404(job_id)
    columns = batch_service.get_eligible_columns(job_dir)
    return {
        "job_id": job_id,
        "columns": columns,
        "available_columns": [c["name"] for c in columns],
    }