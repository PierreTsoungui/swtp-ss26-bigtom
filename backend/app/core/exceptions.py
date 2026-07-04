# app/core/exceptions.py
from app.core.error_types import AppException, ErrorTypes


class InvalidTransitionError(AppException):
    """
    Wird von transition_job geworfen, wenn ein Zustandsübergang nicht erlaubt ist.
    Wird automatisch vom app_exception_handler in main.py zu HTTP 409 gemappt.
    """
    def __init__(self, job_id: str, message: str, instance: str | None = None):
        super().__init__(
            error_type=ErrorTypes.INVALID_STATE_TRANSITION,
            detail=message,
            instance=instance,
            job_id=job_id,
        )
        self.job_id = job_id


class JobSessionExpiredError(AppException):
    """
    Raised when a job's directory still exists on disk but its in-memory session
    (the job manager's state machine) is gone — e.g. after a backend restart or
    once the in-memory record has been evicted while the files linger.

    Because it is an ``AppException`` it is turned into a clean RFC 9457 JSON
    response (HTTP 410 Gone) by the ``app_exception_handler`` in main.py, instead
    of surfacing as an unhandled ``KeyError`` / raw 500 that the frontend cannot
    parse as JSON.
    """
    def __init__(self, job_id: str, detail: str | None = None, instance: str | None = None):
        super().__init__(
            error_type=ErrorTypes.SESSION_EXPIRED,
            detail=detail or (
                f"The session for job '{job_id}' is no longer available on the "
                "server. It may have expired or the server was restarted. Please "
                "re-run the analysis to continue."
            ),
            instance=instance,
            job_id=job_id,
        )
        self.job_id = job_id