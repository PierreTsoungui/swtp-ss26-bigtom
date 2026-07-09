# app/api/routes/upload.py
"""Routes for uploading data (legacy single-shot and folder/ZIP inspect/commit)."""

import json
import uuid

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from pydantic import ValidationError

from app.core.error_types import ErrorTypes, problem_detail
from app.models.filter import FilterSettings
from app.models.upload import (
    CommitRequest,
    InspectManifest,
    SheetPreview,
    UploadResponse,
)
from app.services import (
    job_manager,
    pipeline_task,
    staging_manager,
    upload_commit_service,
    upload_inspect_service,
    upload_service,
)
from app.services.file_handler import (
    ensure_upload_dir,
    validate_idat_files,
    validate_sample_sheet,
)
from app.services.job_manager import JobPhase, JobStatusValue

router = APIRouter()


# ══════════════════════════════════════════════════════════════════════════════
# Folder / ZIP upload: inspect → commit  (UPL-01)
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/upload/inspect", response_model=InspectManifest, status_code=201)
async def inspect_upload(files: list[UploadFile] = File(...)):
    """Stage a folder/ZIP/file selection and return the classified manifest.

    Heavy work (extraction, scanning) runs in a worker thread inside the service.
    Non-fatal issues (e.g. multiple sample sheets) come back in ``errors`` and
    block the UI; fatal problems map to RFC-9457 errors.
    """
    return await upload_inspect_service.inspect_upload(files)


@router.get("/upload/{session_id}/preview", response_model=SheetPreview)
async def preview_sample_sheet(
    session_id: str,
    sheet_id: str = Query(...),
    rows: int = Query(20, ge=1, le=200),
):
    """Lazy tabular preview of a staged candidate sample sheet."""
    session_dir = staging_manager.require_session(session_id)
    return upload_inspect_service.build_sheet_preview(session_dir, sheet_id, rows)


@router.post("/upload/commit", response_model=UploadResponse, status_code=201)
async def commit_upload(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: CommitRequest,
):
    """Confirm the selection, create the job and launch the filtering pipeline."""
    job_id, job_dir = upload_commit_service.persist_committed_job(payload, request.url.path)

    background_tasks.add_task(
        pipeline_task.run_job_pipeline,
        job_id,
        lambda cancel_event: upload_service.run_upload_pipeline(
            job_id,
            str(job_dir),
            "SampleSheet.csv",
            payload.filter_settings,
            cancel_event,
        ),
    )

    return UploadResponse(
        job_id=job_id,
        status=JobStatusValue.WAITING.value,
        filter_settings=payload.filter_settings.model_dump(),
    )


@router.delete("/upload/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_upload(session_id: str):
    """Discard a staging session (user cancelled)."""
    staging_manager.delete_session(session_id)


# ══════════════════════════════════════════════════════════════════════════════
# Legacy single-shot upload (deprecated, replaced by inspect/commit)
# ══════════════════════════════════════════════════════════════════════════════


@router.post("/upload", response_model=UploadResponse, status_code=201, deprecated=True)
async def upload_files(
    request: Request,
    background_tasks: BackgroundTasks,
    idat_files: list[UploadFile] = File(...),
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
            job_id,
            str(job_dir),
            "SampleSheet.csv",
            filter_settings_model,
            cancel_event,
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
            "type": result["type"],
            "title": result["title"],
            "status": result["status"],
            "detail": result["message"],
            "instance": request.url.path,
            **{
                k: v
                for k, v in result.items()
                if k not in ["error", "message", "type", "title", "status"]
            },
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
                f"Failed to parse filter_settings: {exc}",
                request.url.path,
            ),
        ) from exc
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                ErrorTypes.INVALID_FILTER_JSON,
                'filter_settings is missing from the request body. Expected: {"filter_settings": {...}}',
                request.url.path,
            ),
        ) from None

    try:
        return FilterSettings.model_validate(parsed)
    except ValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail=problem_detail(ErrorTypes.INVALID_FILTER_PARAM, str(exc), request.url.path),
        ) from exc
