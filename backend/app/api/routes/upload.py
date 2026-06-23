# app/api/routes/upload.py
import json
import uuid
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Request, Form
from pydantic import ValidationError

from app.core.error_types import ErrorTypes, problem_detail
from app.models.filter import FilterSettings
from app.models.upload import UploadResponse
from app.services import job_manager, pipeline_task, upload_service
from app.services.file_handler import (
    ensure_upload_dir,
    validate_idat_files,
    validate_sample_sheet,
)
from app.services.job_manager import JobPhase, JobStatusValue

router = APIRouter()


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_files(
    request: Request,
    background_tasks: BackgroundTasks,
    idat_files: List[UploadFile] = File(...),
    sample_sheet: UploadFile = File(...),
    filter_settings: str = Form(None),
):
    """Validate the upload, create the job, and launch the filtering pipeline.

    Thin HTTP adapter: input validation maps to HTTP errors here; persistence
    and pipeline orchestration live in ``upload_service``.
    """
    # ── 1. Validate the multipart payload ────────────────────────────────────
    _validate_files(validate_idat_files, idat_files, request)
    _validate_files(validate_sample_sheet, sample_sheet, request)

    # ── 2. Parse the (optional) filter settings from the form field ──────────
    filter_settings_model = _parse_filter_settings(filter_settings, request)

    # ── 3. Create the job and persist its files ──────────────────────────────
    job_id = str(uuid.uuid4())
    job_dir = ensure_upload_dir(job_id)
    upload_service.persist_upload_files(
        job_id, job_dir, idat_files, sample_sheet, filter_settings_model, request.url.path
    )

    job_manager.create_job(job_id)
    job_manager.transition_job(
        job_id,
        new_phase=JobPhase.UPLOADED,
        new_status=JobStatusValue.COMPLETED,
    )

    # ── 4. Launch the pipeline as a managed background task ───────────────────
    # run_job_pipeline owns the cancel_event + task lifecycle (see r-executor.md §6).
    background_tasks.add_task(
        pipeline_task.run_job_pipeline,
        job_id,
        lambda cancel_event: upload_service.run_upload_pipeline(
            job_id, str(job_dir), "SampleSheet.csv", filter_settings_model, cancel_event,
        ),
    )

    return UploadResponse(
        job_id=job_id,
        status=JobStatusValue.WAITING.value,
        filter_settings=filter_settings_model.model_dump(),
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _validate_files(validator, payload, request: Request) -> None:
    """Run a file_handler validator and translate a failure into an HTTP error."""
    ok, result = validator(payload)
    if ok:
        return
    raise HTTPException(
        status_code=result["status"],
        detail={
            "type":     result["type"],
            "title":    result["title"],
            "status":   result["status"],
            "detail":   result["message"],
            "instance": request.url.path,
            **{k: v for k, v in result.items()
               if k not in ["error", "message", "type", "title", "status"]},
        },
    )


def _parse_filter_settings(raw: str, request: Request) -> FilterSettings:
    """Parse the ``filter_settings`` form field into a validated model.

    An empty/absent field yields the default (all filters disabled). A malformed
    JSON body or invalid parameters map to HTTP 400.
    """
    if raw is None or not raw.strip():
        return FilterSettings()

    try:
        parsed = json.loads(raw)["filter_settings"]
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=ErrorTypes.INVALID_FILTER_JSON.status,
            detail=problem_detail(
                ErrorTypes.INVALID_FILTER_JSON,
                f"Fehler beim Parsen von filter_settings: {exc}",
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
        return FilterSettings.model_validate(parsed)
    except ValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(ErrorTypes.INVALID_FILTER_PARAM, str(exc), request.url.path),
        )
