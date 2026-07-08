"""Shared interpretation of a finished R pipeline step.

Every pipeline service runs an R script and then has to react to the result the
same way: a cancellation is a clean stop (the reset flow owns deletion), while a
timeout and a non-zero exit are failures that must move the job into a FAILED
state, and only a success proceeds to the next phase.

Centralizing that cancel/timeout/failure policy — plus the two small field
extractors used by every ``on_progress`` callback — keeps the behaviour uniform
and in one place.

This lives in the service layer (not under ``r_executor``) because applying the
policy requires ``job_manager.transition_job``; keeping it here avoids coupling
the low-level R executor to job-state management.
"""
import logging
from enum import Enum

from app.services.job_manager import transition_job, JobPhase, JobStatusValue
from app.services.r_executor import ExecutionResult

logger = logging.getLogger(__name__)


class StepOutcome(str, Enum):
    """Result of interpreting a finished R step."""

    SUCCESS = "success"
    CANCELLED = "cancelled"
    TIMEOUT = "timeout"
    FAILED = "failed"


def progress_fields(data: dict) -> tuple[int, str]:
    """Extract ``(percent, message)`` from an R progress event.

    Tolerates the alternative key names the R scripts may emit
    (``progress_percent``/``current_step``) and missing keys.
    """
    percent = data.get("percent", data.get("progress_percent", 0))
    message = data.get("message", data.get("current_step", ""))
    return percent, message


def failure_detail(result: ExecutionResult, fallback: str) -> str:
    """Best human-readable reason for a failed R step.

    Prefers the structured message the R script emitted via ``{"type": "error"}``
    (captured in ``extra["r_error"]``) over the raw stderr dump, which is full of
    package-loading noise and would otherwise be shown to the user verbatim.

    A timeout is a special case: the R process is SIGKILLed mid-run, so it never
    emits an error message and its stderr is just the (successful-looking)
    package/analysis log up to the kill. Dumping that as the "error" is
    misleading, so the timeout is reported explicitly instead.
    """
    if result.is_timeout:
        return (
            f"{fallback} The analysis exceeded its time limit and the R script "
            "was aborted. Please retry with fewer samples or raise the time limit."
        )
    return result.extra.get("r_error") or (result.stderr or "").strip() or fallback


def handle_step_result(
    job_id: str,
    result: ExecutionResult,
    *,
    phase: JobPhase,
    fallback: str,
    timeout_step: str,
    failure_step: str,
    timeout_detail: str | None = None,
    cancel_log: str | None = None,
) -> StepOutcome:
    """Apply the standard cancel/timeout/failure policy to a finished R step.

    - ``CANCELLED`` → no transition (the reset flow owns deletion); optionally
      logs ``cancel_log``.
    - ``TIMEOUT``   → FAILED transition using ``timeout_step`` as the status text
      and ``timeout_detail`` (defaults to ``failure_detail``) as the error body.
    - ``FAILED``    → FAILED transition using ``failure_step`` and
      ``failure_detail(result, fallback)``.
    - ``SUCCESS``   → no transition; the caller drives the next phase.

    Returns the :class:`StepOutcome` so the caller can branch — only ``SUCCESS``
    continues the pipeline.
    """
    if result.is_cancelled:
        if cancel_log:
            logger.info(cancel_log)
        return StepOutcome.CANCELLED

    if result.is_timeout:
        detail = timeout_detail or failure_detail(result, fallback)
        logger.error("R step timed out: job_id=%s phase=%s", job_id, phase.value)
        transition_job(
            job_id,
            new_phase=phase,
            new_status=JobStatusValue.FAILED,
            current_step=timeout_step,
            error={"detail": detail},
        )
        return StepOutcome.TIMEOUT

    if not result.is_success:
        detail = failure_detail(result, fallback)
        logger.error(
            "R step failed: job_id=%s phase=%s detail=%s", job_id, phase.value, detail
        )
        transition_job(
            job_id,
            new_phase=phase,
            new_status=JobStatusValue.FAILED,
            current_step=failure_step,
            error={"detail": detail},
        )
        return StepOutcome.FAILED

    return StepOutcome.SUCCESS
