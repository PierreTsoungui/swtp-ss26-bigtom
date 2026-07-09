"""Tests for the job_manager state machine and its registries.

The state machine is core application logic, so every allowed transition is
exercised, every rejection path is asserted, and the reset semantics (which must
never let a job be revived by a trailing signal) are verified explicitly.
"""

import asyncio

import pytest

from app.core.exceptions import InvalidTransitionError, JobSessionExpiredError
from app.services import job_manager
from app.services.job_manager import JobPhase, JobStatusValue


@pytest.fixture(autouse=True)
def clean_registries():
    """Isolate every test from the module-level, in-memory registries."""
    for registry in (
        job_manager.jobs,
        job_manager.cancel_events,
        job_manager.resetting_jobs,
        job_manager.job_tasks,
    ):
        registry.clear()
    yield
    for registry in (
        job_manager.jobs,
        job_manager.cancel_events,
        job_manager.resetting_jobs,
        job_manager.job_tasks,
    ):
        registry.clear()


def _force_state(job_id: str, phase: JobPhase, status: JobStatusValue):
    """Create a job and move it directly into ``(phase, status)`` for the test."""
    job = job_manager.create_job(job_id)
    job.phase = phase.value
    job.status = status.value
    return job


# ── Creation ──────────────────────────────────────────────────────────────────


def test_create_job_starts_in_uploaded_waiting():
    job = job_manager.create_job("job-1")
    assert job.phase == JobPhase.UPLOADED.value
    assert job.status == JobStatusValue.WAITING.value
    assert job.progress_percent == 0
    assert job.error is None
    assert job_manager.get_job("job-1") is job


# ── Valid transitions ─────────────────────────────────────────────────────────

_ALL_EDGES = [
    (from_state, to_state)
    for from_state, to_states in job_manager._ALLOWED_TRANSITIONS.items()
    for to_state in to_states
]


@pytest.mark.parametrize("from_state,to_state", _ALL_EDGES)
def test_every_allowed_transition_is_accepted(from_state, to_state):
    from_phase, from_status = from_state
    to_phase, to_status = to_state
    _force_state("job-1", from_phase, from_status)

    result = job_manager.transition_job("job-1", new_phase=to_phase, new_status=to_status)

    assert result is not None
    assert result.phase == to_phase.value
    assert result.status == to_status.value


def test_transition_updates_progress_and_step():
    _force_state("job-1", JobPhase.FILTERING, JobStatusValue.RUNNING)
    result = job_manager.transition_job(
        "job-1",
        new_phase=JobPhase.FILTERING,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=100,
        current_step="done",
    )
    assert result.progress_percent == 100
    assert result.current_step == "done"


# ── Invalid transitions ───────────────────────────────────────────────────────


def test_invalid_transition_raises():
    job_manager.create_job("job-1")  # UPLOADED / WAITING
    with pytest.raises(InvalidTransitionError):
        job_manager.transition_job(
            "job-1",
            new_phase=JobPhase.RESULTS,
            new_status=JobStatusValue.COMPLETED,
        )


def test_invalid_transition_leaves_job_untouched():
    job = job_manager.create_job("job-1")
    with pytest.raises(InvalidTransitionError):
        job_manager.transition_job(
            "job-1", new_phase=JobPhase.HEATMAP, new_status=JobStatusValue.RUNNING
        )
    assert job.phase == JobPhase.UPLOADED.value
    assert job.status == JobStatusValue.WAITING.value


def test_transition_on_missing_job_raises_session_expired():
    with pytest.raises(JobSessionExpiredError):
        job_manager.transition_job(
            "unknown",
            new_phase=JobPhase.FILTERING,
            new_status=JobStatusValue.RUNNING,
        )


# ── FAILED error handling ─────────────────────────────────────────────────────


def test_failed_transition_stores_error_body():
    _force_state("job-1", JobPhase.FILTERING, JobStatusValue.RUNNING)
    job_manager.transition_job(
        "job-1",
        new_phase=JobPhase.FILTERING,
        new_status=JobStatusValue.FAILED,
        error={"detail": "boom"},
    )
    assert job_manager.get_job("job-1").error == {"detail": "boom"}


def test_non_failed_transition_clears_previous_error():
    job = _force_state("job-1", JobPhase.FILTERING, JobStatusValue.RUNNING)
    job.error = {"detail": "stale"}
    job_manager.transition_job(
        "job-1",
        new_phase=JobPhase.FILTERING,
        new_status=JobStatusValue.COMPLETED,
    )
    assert job.error is None


# ── set_progress ──────────────────────────────────────────────────────────────


def test_set_progress_updates_and_marks_running():
    job_manager.create_job("job-1")
    result = job_manager.set_progress("job-1", percent=42, message="working")
    assert result.progress_percent == 42
    assert result.current_step == "working"
    assert result.status == JobStatusValue.RUNNING.value


def test_set_progress_on_missing_job_returns_none():
    assert job_manager.set_progress("unknown", 10, "x") is None


# ── Reset semantics ───────────────────────────────────────────────────────────


def test_begin_reset_serializes_concurrent_resets():
    assert job_manager.begin_reset("job-1") is True
    assert job_manager.begin_reset("job-1") is False
    assert job_manager.is_resetting("job-1") is True


def test_end_reset_releases_the_slot():
    job_manager.begin_reset("job-1")
    job_manager.end_reset("job-1")
    assert job_manager.is_resetting("job-1") is False
    # The slot can be claimed again after release.
    assert job_manager.begin_reset("job-1") is True


def test_end_reset_is_safe_without_active_reset():
    job_manager.end_reset("never-started")  # must not raise
    assert job_manager.is_resetting("never-started") is False


def test_transition_during_reset_is_silently_dropped():
    job = job_manager.create_job("job-1")
    job_manager.begin_reset("job-1")
    result = job_manager.transition_job(
        "job-1",
        new_phase=JobPhase.UPLOADED,
        new_status=JobStatusValue.COMPLETED,
    )
    assert result is None
    assert job.status == JobStatusValue.WAITING.value


def test_set_progress_during_reset_is_silently_dropped():
    job = job_manager.create_job("job-1")
    job_manager.begin_reset("job-1")
    result = job_manager.set_progress("job-1", percent=99, message="late")
    assert result is None
    assert job.progress_percent == 0


def test_reset_prevents_a_running_job_from_being_revived():
    job = _force_state("job-1", JobPhase.FILTERING, JobStatusValue.RUNNING)
    job_manager.begin_reset("job-1")

    # Both trailing signals a background task might still emit must be no-ops.
    assert (
        job_manager.transition_job(
            "job-1",
            new_phase=JobPhase.FILTERING,
            new_status=JobStatusValue.COMPLETED,
        )
        is None
    )
    assert job_manager.set_progress("job-1", 100, "late") is None

    assert job.phase == JobPhase.FILTERING.value
    assert job.status == JobStatusValue.RUNNING.value
    assert job.progress_percent == 0


# ── Cancel-event registry ─────────────────────────────────────────────────────


def test_cancel_event_register_lookup_and_trigger():
    event = asyncio.Event()
    job_manager.register_cancel_event("job-1", event)

    assert job_manager.get_cancel_event("job-1") is event
    assert job_manager.trigger_cancel("job-1") is True
    assert event.is_set()
    # A second trigger finds the event already set and reports no action.
    assert job_manager.trigger_cancel("job-1") is False

    job_manager.unregister_cancel_event("job-1")
    assert job_manager.get_cancel_event("job-1") is None


def test_trigger_cancel_on_unknown_job_returns_false():
    assert job_manager.trigger_cancel("unknown") is False


# ── delete_job ────────────────────────────────────────────────────────────────


def test_delete_job_reports_whether_it_existed():
    job_manager.create_job("job-1")
    assert job_manager.delete_job("job-1") is True
    assert job_manager.delete_job("job-1") is False
    assert job_manager.get_job("job-1") is None
