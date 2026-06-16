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