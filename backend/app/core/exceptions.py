# app/core/exceptions.py
"""Domain-specific exceptions mapped to RFC 9457 responses by the app handler."""

from app.core.error_types import AppException, ErrorTypes


class InvalidTransitionError(AppException):
    """Raised by ``transition_job`` for a disallowed job state transition.

    Mapped to HTTP 409 by the ``app_exception_handler`` in main.py.
    """

    def __init__(self, job_id: str, message: str, instance: str | None = None):
        """Build the 409 error for an illegal transition of ``job_id``."""
        super().__init__(
            error_type=ErrorTypes.INVALID_STATE_TRANSITION,
            detail=message,
            instance=instance,
            job_id=job_id,
        )
        self.job_id = job_id


class JobSessionExpiredError(AppException):
    """Raised when a job's files exist on disk but its in-memory session is gone.

    Happens e.g. after a backend restart or once the in-memory record has been
    evicted while the files linger. Because it is an ``AppException`` the
    ``app_exception_handler`` turns it into a clean RFC 9457 JSON response
    (HTTP 410 Gone) instead of an unhandled ``KeyError`` / raw 500 that the
    frontend cannot parse.
    """

    def __init__(self, job_id: str, detail: str | None = None, instance: str | None = None):
        """Build the 410 error for the expired in-memory session of ``job_id``."""
        super().__init__(
            error_type=ErrorTypes.SESSION_EXPIRED,
            detail=detail
            or (
                f"The session for job '{job_id}' is no longer available on the "
                "server. It may have expired or the server was restarted. Please "
                "re-run the analysis to continue."
            ),
            instance=instance,
            job_id=job_id,
        )
        self.job_id = job_id
