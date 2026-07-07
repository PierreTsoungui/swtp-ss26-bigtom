# app/core/error_types.py
"""RFC 9457 problem types, the ``AppException`` base and the FastAPI handler."""
from typing import Dict, Any, Optional
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class ErrorType:
    """A single RFC 9457 problem type: its URI ``path``, HTTP ``status`` and ``title``."""

    def __init__(self, path: str, status: int, title: str):
        """Store the problem type's URI path, HTTP status code and title."""
        self.path = path
        self.status = status
        self.title = title


class ErrorTypes:
    """Registry of the application's RFC 9457 problem types."""

    # Status Errors (404, 410)
    JOB_NOT_FOUND = ErrorType("/errors/job-not-found", 404, "Job not found")
    SESSION_EXPIRED = ErrorType("/errors/session-expired", 410, "Session expired")

    # Upload Errors (400, 500)
    INVALID_UPLOAD = ErrorType("/errors/invalid-upload", 400, "Invalid upload")
    SAVE_FAILED    = ErrorType("/errors/save-failed", 500, "Save failed")

    # Reset Errors (500) — the job's data could not be fully deleted on reset.
    RESET_FAILED   = ErrorType("/errors/reset-failed", 500, "Reset failed")

    # ── FOLDER / ZIP UPLOAD (inspect → commit) ─────────────────────────
    INVALID_ARCHIVE      = ErrorType("/errors/invalid-archive", 400, "Invalid archive")
    ARCHIVE_TOO_LARGE    = ErrorType("/errors/archive-too-large", 400, "Archive too large")
    NO_SUPPORTED_FILES   = ErrorType("/errors/no-supported-files", 400, "No supported files")
    MULTIPLE_SAMPLE_SHEETS = ErrorType("/errors/multiple-sample-sheets", 400, "Multiple sample sheets")
    NO_SAMPLE_SHEET      = ErrorType("/errors/no-sample-sheet", 400, "No sample sheet")
    NO_IDAT_FILES        = ErrorType("/errors/no-idat-files", 400, "No IDAT files")
    UNPAIRED_IDATS       = ErrorType("/errors/unpaired-idats", 400, "Unpaired IDAT files")
    TOO_MANY_SAMPLES     = ErrorType("/errors/too-many-samples", 400, "Too many samples")
    STORAGE_LIMIT_EXCEEDED = ErrorType("/errors/storage-limit-exceeded", 507, "Storage limit exceeded")
    INVALID_SELECTION    = ErrorType("/errors/invalid-selection", 400, "Invalid selection")
    INVALID_COLUMN_MAPPING = ErrorType("/errors/invalid-column-mapping", 400, "Invalid column mapping")
    SESSION_NOT_FOUND    = ErrorType("/errors/session-not-found", 404, "Upload session not found")
    
    # Filter Errors (409, 404)
    FILTERING_NOT_FINISHED = ErrorType("/errors/filtering-not-finished", 409, "Filtering not finished")
    NO_STATS_AVAILABLE = ErrorType("/errors/no-stats-available", 404, "No stats available")
    
    # Normalization Errors
    INVALID_NORMALIZATION_METHOD = ErrorType("/errors/invalid-normalization-method", 400, "Invalid normalization method")
    NORMALIZATION_NOT_ALLOWED = ErrorType("/errors/normalization-not-allowed", 409, "Normalization not allowed")
    NORMALIZATION_FAILED = ErrorType("/errors/normalization-failed", 500, "Normalization failed")
    INVALID_FILTER_PARAM = ErrorType("/errors/invalid-filter-param", 400, "Invalid filter parameter")
    INVALID_FILTER_JSON = ErrorType("/errors/invalid-filter-json", 400, "Invalid filter JSON")
    # Table Errors
    INVALID_SORT_COLUMN = ErrorType("/errors/invalid-sort-column", 400, "Invalid sort column")  
    INVALID_PARAMETER = ErrorType("/errors/invalid-parameter", 400, "Invalid parameter")
    INVALID_SORT_ORDER = ErrorType("/errors/invalid-sort-order", 400, "Invalid sort order")
    # ── BATCH CORRECTION ERRORS (400, 404, 409) ───────────────────────
    PLOT_NOT_FOUND = ErrorType("/errors/plot-not-found", 404, "SVD plot not found")
    INVALID_BATCH_VARIABLE = ErrorType("/errors/invalid-batch-variable", 400, "Invalid batch variable")
    INVALID_COVARIATE = ErrorType("/errors/invalid-covariate", 400, "Invalid covariate")
    COVARIATE_EQUALS_BATCH = ErrorType("/errors/covariate-equals-batch", 400, "Covariate equals batch variable")
    BATCH_NOT_ALLOWED = ErrorType("/errors/batch-not-allowed", 409, "Batch correction not allowed")

    # ── SAMPLE SHEET ERRORS ────────────────────────────────────────────
    SAMPLE_SHEET_NOT_FOUND = ErrorType("/errors/sample-sheet-not-found", 404, "Sample sheet not found")
    FILE_NOT_FOUND          = ErrorType("/errors/file-not-found", 404, "File not found")
    HEATMAP_NOT_ALLOWED     = ErrorType("/errors/heatmap-not-allowed", 409, "Heatmap not allowed")
    HEATMAP_TOO_MANY_CPGS   = ErrorType("/errors/heatmap-too-many-cpgs", 400, "Too many CpGs for heatmap")
    HEATMAP_NO_CPGS         = ErrorType("/errors/heatmap-no-cpgs", 400, "No CpGs match the filter")
    INVALID_GROUPING_COLUMN = ErrorType("/errors/invalid-grouping-column", 400, "Invalid grouping column")
    INVALID_CSV_CONTENT     = ErrorType("/errors/invalid-csv-content", 400, "Invalid CSV content") 

    INVALID_STATE_TRANSITION = ErrorType("/errors/invalid-state-transition", 409, "Invalid state transition")

def problem_detail(
    error_type: ErrorType,
    detail: str,
    instance: Optional[str] = None,
    **extras,
) -> Dict[str, Any]:
    """Build an RFC 9457-conformant problem body.

    Args:
        error_type: The problem type providing ``type``, ``title`` and ``status``.
        detail: A human-readable explanation specific to this occurrence.
        instance: Optional URI reference identifying the specific occurrence.
        **extras: Additional members merged into the problem body.

    Returns:
        The problem body as a dictionary.
    """
    body = {
        "type": error_type.path,
        "title": error_type.title,
        "status": error_type.status,
        "detail": detail,
    }
    if instance:
        body["instance"] = instance
    body.update(extras)
    return body


class AppException(Exception):
    """Application error carrying an ``ErrorType`` and a ready RFC 9457 body."""

    def __init__(self, error_type, detail: str, instance: Optional[str] = None, **extras):
        """Build the problem body from ``error_type`` and the given detail/extras."""
        self.status_code = error_type.status
        self.error_body = problem_detail(error_type, detail, instance, **extras)
        super().__init__(detail)


BatchException = AppException


async def app_exception_handler(request: Request, exc: AppException):
    """Render an ``AppException`` as an RFC 9457 JSON response."""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.error_body,
    )