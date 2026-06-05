# app/core/error_types.py
from typing import Dict, Any, Optional
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse

class ErrorType:
    def __init__(self, path: str, status: int, title: str):
        self.path = path
        self.status = status
        self.title = title

class ErrorTypes:
    # Status Errors (404, 410)
    JOB_NOT_FOUND = ErrorType("/errors/job-not-found", 404, "Job not found")
    SESSION_EXPIRED = ErrorType("/errors/session-expired", 410, "Session expired")
    
    # Filter Errors (409, 404)
    FILTERING_NOT_FINISHED = ErrorType("/errors/filtering-not-finished", 409, "Filtering not finished")
    NO_STATS_AVAILABLE = ErrorType("/errors/no-stats-available", 404, "No stats available")
    
    # Normalization Errors
    INVALID_NORMALIZATION_METHOD = ErrorType("/errors/invalid-normalization-method", 400, "Invalid normalization method")
    NORMALIZATION_NOT_ALLOWED = ErrorType("/errors/normalization-not-allowed", 409, "Normalization not allowed")
    NORMALIZATION_FAILED = ErrorType("/errors/normalization-failed", 500, "Normalization failed")
    INVALID_FILTER_PARAM = ErrorType("/errors/invalid-filter-param", 400, "Invalid filter parameter")
    INVALID_FILTER_JSON = ErrorType("/errors/invalid-filter-json", 400, "Invalid filter JSON")

    # ── BATCH CORRECTION ERRORS (400, 404, 409) ───────────────────────
    PLOT_NOT_FOUND = ErrorType("/errors/plot-not-found", 404, "SVD plot not found")
    INVALID_BATCH_VARIABLE = ErrorType("/errors/invalid-batch-variable", 400, "Invalid batch variable")
    COVARIATE_EQUALS_BATCH = ErrorType("/errors/covariate-equals-batch", 400, "Covariate equals batch variable")
    BATCH_NOT_ALLOWED = ErrorType("/errors/batch-not-allowed", 409, "Batch correction not allowed")

    # ── SAMPLE SHEET ERRORS ────────────────────────────────────────────
    SAMPLE_SHEET_NOT_FOUND = ErrorType("/errors/sample-sheet-not-found", 404, "Sample sheet not found")

def problem_detail(
    error_type: ErrorType,
    detail: str,
    instance: Optional[str] = None,
    **extras
) -> Dict[str, Any]:
    """Erzeugt RFC 9457 konformen Fehler-Body"""
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
    """Erlaubt es, Fehler direkt mit einem ErrorType-Objekt zu werfen."""
    def __init__(self, error_type, detail: str, instance: Optional[str] = None, **extras):
        self.status_code = error_type.status
        self.error_body = problem_detail(error_type, detail, instance, **extras)
        super().__init__(detail)

BatchException = AppException

async def app_exception_handler(request: Request, exc: AppException):
    """Fängt die AppException ab und transformiert sie in gültiges RFC 9457 JSON"""
    return JSONResponse(
        status_code=exc.status_code,
        content=exc.error_body
    )