"""Tests for the shared R-step outcome handling.

Covers the failure/timeout message classification and the cancel/timeout/failure
policy that every pipeline service relies on.
"""
import pytest

from app.services import job_manager
from app.services.job_manager import JobPhase, JobStatusValue
from app.services.pipeline_outcome import (
    StepOutcome,
    failure_detail,
    handle_step_result,
    progress_fields,
)
from app.services.r_executor import ExecutionResult, ExecutionStatus


def _result(status, *, returncode=0, stdout="", stderr="", extra=None):
    result = ExecutionResult(
        status=status, returncode=returncode, stdout=stdout, stderr=stderr
    )
    if extra:
        result.extra.update(extra)
    return result


# ── failure_detail ────────────────────────────────────────────────────────────

def test_timeout_returns_the_timeout_message_not_stderr():
    result = _result(ExecutionStatus.TIMEOUT, stderr="Loading required package: minfi")
    detail = failure_detail(result, "dmr.R failed.")
    assert "time limit" in detail
    assert detail.startswith("dmr.R failed.")
    # The misleading stderr banner must not be surfaced as the reason.
    assert "Loading required package" not in detail


def test_structured_r_error_is_preferred_over_stderr():
    result = _result(
        ExecutionStatus.FAILED,
        returncode=1,
        stderr="huge package-loading dump",
        extra={"r_error": "No sample variance"},
    )
    assert failure_detail(result, "fallback") == "No sample variance"


def test_stderr_is_used_when_no_structured_error():
    result = _result(ExecutionStatus.FAILED, returncode=1, stderr="  boom  ")
    assert failure_detail(result, "fallback") == "boom"


def test_fallback_is_used_when_nothing_available():
    result = _result(ExecutionStatus.FAILED, returncode=1)
    assert failure_detail(result, "fallback") == "fallback"


# ── progress_fields ───────────────────────────────────────────────────────────

def test_progress_fields_reads_primary_keys():
    assert progress_fields({"percent": 50, "message": "step"}) == (50, "step")


def test_progress_fields_reads_alternative_keys():
    assert progress_fields(
        {"progress_percent": 30, "current_step": "other"}
    ) == (30, "other")


def test_progress_fields_defaults_on_missing_keys():
    assert progress_fields({}) == (0, "")


# ── handle_step_result ────────────────────────────────────────────────────────

@pytest.fixture
def running_job():
    job_manager.jobs.clear()
    job_manager.resetting_jobs.clear()
    job = job_manager.create_job("job-1")
    job.phase = JobPhase.NORMALIZATION.value
    job.status = JobStatusValue.RUNNING.value
    yield job
    job_manager.jobs.clear()
    job_manager.resetting_jobs.clear()


def _handle(result):
    return handle_step_result(
        "job-1",
        result,
        phase=JobPhase.NORMALIZATION,
        fallback="normalize.R failed.",
        timeout_step="Timed out",
        failure_step="Failed",
        timeout_detail="Normalization timeout.",
        cancel_log="cancelled",
    )


def test_success_returns_success_without_transitioning(running_job):
    outcome = _handle(_result(ExecutionStatus.COMPLETED))
    assert outcome is StepOutcome.SUCCESS
    assert running_job.status == JobStatusValue.RUNNING.value


def test_cancelled_returns_cancelled_without_transitioning(running_job):
    outcome = _handle(_result(ExecutionStatus.CANCELLED))
    assert outcome is StepOutcome.CANCELLED
    assert running_job.status == JobStatusValue.RUNNING.value


def test_timeout_transitions_to_failed_with_timeout_detail(running_job):
    outcome = _handle(_result(ExecutionStatus.TIMEOUT, stderr="noise"))
    assert outcome is StepOutcome.TIMEOUT
    assert running_job.status == JobStatusValue.FAILED.value
    assert running_job.current_step == "Timed out"
    assert running_job.error == {"detail": "Normalization timeout."}


def test_failure_transitions_to_failed_with_failure_detail(running_job):
    outcome = _handle(
        _result(ExecutionStatus.FAILED, returncode=1, extra={"r_error": "real cause"})
    )
    assert outcome is StepOutcome.FAILED
    assert running_job.status == JobStatusValue.FAILED.value
    assert running_job.current_step == "Failed"
    assert running_job.error == {"detail": "real cause"}
