# app/core/error_types.py
from typing import Dict, Any, Optional

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
    
    INVALID_NORMALIZATION_METHOD = ErrorType("/errors/invalid-normalization-method", 400, "Invalid normalization method")
    NORMALIZATION_NOT_ALLOWED = ErrorType("/errors/normalization-not-allowed", 409, "Normalization not allowed")
    NORMALIZATION_FAILED = ErrorType("/errors/normalization-failed", 500, "Normalization failed")

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