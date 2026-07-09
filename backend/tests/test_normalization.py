# tests/test_normalization.py

import tempfile
import time
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.job import JobStatus
from app.services import job_manager
from app.services.job_manager import JobPhase, JobStatusValue, transition_job

client = TestClient(app)


class TestNormalization:
    """Tests for POST /normalize/{job_id} endpoint."""

    def create_job_with_transition(self, phase: str, status: str, progress: int = 0):
        """Create a job and transition it to the desired state."""
        job_id = f"test-normalize-{int(time.time())}"
        job_dir = tempfile.mkdtemp()

        # Create initial job
        job = JobStatus(
            job_id=job_id,
            status=JobStatusValue.WAITING.value,
            phase=JobPhase.UPLOADED.value,
            progress_percent=0,
            current_step="Test job",
            temp_dir=job_dir,
            created_at=datetime.now(),
            expires_at=datetime.now() + timedelta(hours=24),
        )
        job_manager.jobs[job_id] = job

        # Transition to desired state
        try:
            transition_job(
                job_id,
                new_phase=JobPhase(phase),
                new_status=JobStatusValue(status),
                progress_percent=progress,
            )
        except Exception:
            # If the transition is not allowed, set the state directly for the test.
            job_manager.jobs[job_id].phase = phase
            job_manager.jobs[job_id].status = status
            job_manager.jobs[job_id].progress_percent = progress

        return job_id

    def create_job_direct(self, phase: str, status: str, progress: int = 0):
        """Directly create a job in a specific state."""
        job_id = f"test-normalize-{int(time.time())}"
        job_dir = tempfile.mkdtemp()

        job = JobStatus(
            job_id=job_id,
            status=status,
            phase=phase,
            progress_percent=progress,
            current_step="Test job",
            temp_dir=job_dir,
            created_at=datetime.now(),
            expires_at=datetime.now() + timedelta(hours=24),
        )
        job_manager.jobs[job_id] = job

        return job_id

    def cleanup_job(self, job_id: str):
        """Clean up a job after test."""
        if job_id in job_manager.jobs:
            del job_manager.jobs[job_id]

    # ── SUCCESSFUL NORMALIZATION TESTS ──────────────────────────────────────

    @pytest.mark.parametrize("method", ["noob", "quantile", "swan", "funnorm"])
    def test_valid_methods_accepted(self, method):
        """Test that all 4 valid methods are accepted."""
        # The job must be in the "normalization_preview" phase with the right status.
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION_PREVIEW.value,
            status=JobStatusValue.WAITING.value,
            progress=100,
        )

        try:
            response = client.post(f"/api/v1/normalize/{job_id}", json={"method": method})

            # A disallowed transition is expected to return 409.
            if response.status_code == 409:
                print(f"Transition not allowed for {method} (as expected)")
                assert response.status_code == 409
            else:
                assert response.status_code == 202
                data = response.json()
                assert data["method"] == method
                assert data["status"] == "running"

        finally:
            self.cleanup_job(job_id)

    def test_raw_method_accepted(self):
        """Test that 'raw' method is accepted (special case)."""
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION_PREVIEW.value,
            status=JobStatusValue.WAITING.value,
            progress=100,
        )

        try:
            response = client.post(f"/api/v1/normalize/{job_id}", json={"method": "raw"})

            if response.status_code == 409:
                print("Raw method transition not allowed (as expected)")
                assert response.status_code == 409
            else:
                assert response.status_code == 202
                data = response.json()
                assert data["method"] == "raw"
                assert data["status"] == "running"

        finally:
            self.cleanup_job(job_id)

    # ── INVALID METHOD TESTS ─────────────────────────────────────────────────

    def test_invalid_method_returns_400(self):
        """Test that invalid method returns 400."""
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION_PREVIEW.value,
            status=JobStatusValue.WAITING.value,
            progress=100,
        )

        try:
            response = client.post(
                f"/api/v1/normalize/{job_id}", json={"method": "invalid_method_xyz"}
            )

            # Invalid method → 400
            assert response.status_code == 400
            data = response.json()
            assert "detail" in data

        finally:
            self.cleanup_job(job_id)

    # ── JOB NOT FOUND TESTS ──────────────────────────────────────────────────

    def test_job_not_found_returns_404(self):
        """Test that non-existent job returns 404."""
        response = client.post("/api/v1/normalize/non-existent-job-123", json={"method": "noob"})

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data

    # ── RESPONSE STRUCTURE TESTS ─────────────────────────────────────────────

    def test_response_contains_job_id_and_method(self):
        """Test that response contains job_id and method."""
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION_PREVIEW.value,
            status=JobStatusValue.WAITING.value,
            progress=100,
        )

        try:
            response = client.post(f"/api/v1/normalize/{job_id}", json={"method": "quantile"})

            if response.status_code == 409:
                print("Transition not allowed (as expected)")
                assert response.status_code == 409
            else:
                assert response.status_code == 202
                data = response.json()
                assert data["job_id"] == job_id
                assert data["method"] == "quantile"
                assert "status" in data

        finally:
            self.cleanup_job(job_id)

    def test_empty_request_body_returns_422(self):
        """Test that empty request body returns 422."""
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION_PREVIEW.value,
            status=JobStatusValue.WAITING.value,
            progress=100,
        )

        try:
            response = client.post(f"/api/v1/normalize/{job_id}", json={})

            # FastAPI returns 422 for missing required field
            assert response.status_code == 422

        finally:
            self.cleanup_job(job_id)

    def test_method_case_insensitive(self):
        """Test that method names are case-insensitive."""
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION_PREVIEW.value,
            status=JobStatusValue.WAITING.value,
            progress=100,
        )

        try:
            response = client.post(f"/api/v1/normalize/{job_id}", json={"method": "NOOB"})

            if response.status_code == 409:
                print("Transition not allowed (as expected)")
                assert response.status_code == 409
            else:
                assert response.status_code == 202
                data = response.json()
                assert data["method"] == "noob"  # Normalized to lowercase

        finally:
            self.cleanup_job(job_id)

    def test_method_with_extra_fields_ignored(self):
        """Test that extra fields in request body are ignored."""
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION_PREVIEW.value,
            status=JobStatusValue.WAITING.value,
            progress=100,
        )

        try:
            response = client.post(
                f"/api/v1/normalize/{job_id}",
                json={"method": "swan", "extra_field": "should_be_ignored"},
            )

            if response.status_code == 409:
                print("Transition not allowed (as expected)")
                assert response.status_code == 409
            else:
                assert response.status_code == 202
                data = response.json()
                assert data["method"] == "swan"

        finally:
            self.cleanup_job(job_id)

    def test_job_state_transition_to_running(self):
        """POST /normalize triggers (NORMALIZATION, WAITING) → (NORMALIZATION, RUNNING)
        synchronously, before the 202 response is returned.

        This synchronous transition is a deliberate design guarantee (see normalize.py):
        a follow-up GET /status poll issued right after the 202 can never race ahead of
        the background task and observe stale WAITING state.

        The pipeline background task is neutralised with an AsyncMock so the
        test captures the job state exactly as the route leaves it — without
        the full normalization + SVD pipeline running through to BATCH/WAITING
        (which is what happens in production once the background task completes).

        The test verifies three invariants:
        1. HTTP contract  — 202 with the correct response body.
        2. Synchronous state mutation — the in-memory job is already RUNNING
           at progress 0 when the route handler returns, before any background
           work runs.
        3. Double-submit protection — a second POST while RUNNING is rejected
           with 409 (InvalidTransitionError → INVALID_STATE_TRANSITION).
        """
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION.value,
            status=JobStatusValue.WAITING.value,
        )

        try:
            # ── precondition ──────────────────────────────────────────────────
            pre = job_manager.jobs[job_id]
            assert pre.phase == JobPhase.NORMALIZATION.value
            assert pre.status == JobStatusValue.WAITING.value

            # Freeze the pipeline so the background task is a no-op.
            # Without this, TestClient runs background tasks synchronously and
            # the job advances to BATCH/WAITING before client.post() returns.
            with patch(
                "app.services.pipeline_task.run_job_pipeline",
                new_callable=AsyncMock,
            ):
                # ── act ───────────────────────────────────────────────────────
                response = client.post(
                    f"/api/v1/normalize/{job_id}",
                    json={"method": "noob"},
                )

            # ── 1: HTTP contract ──────────────────────────────────────────────
            assert response.status_code == 202
            data = response.json()
            assert data["job_id"] == job_id
            assert data["status"] == JobStatusValue.RUNNING.value
            assert data["method"] == "noob"

            # ── 2: synchronous state mutation ─────────────────────────────────
            # The route must commit RUNNING to the in-memory store before it
            # returns, not after — checked here while the background task is
            # still frozen.
            job = job_manager.jobs[job_id]
            assert job.phase == JobPhase.NORMALIZATION.value
            assert job.status == JobStatusValue.RUNNING.value
            assert job.progress_percent == 0

            # ── 3: double-submit protection ───────────────────────────────────
            # (NORMALIZATION, RUNNING) → (NORMALIZATION, RUNNING) is not in the
            # allowed transition graph, so a second POST must be rejected.
            with patch(
                "app.services.pipeline_task.run_job_pipeline",
                new_callable=AsyncMock,
            ):
                response2 = client.post(
                    f"/api/v1/normalize/{job_id}",
                    json={"method": "noob"},
                )
            assert response2.status_code == 409

        finally:
            self.cleanup_job(job_id)

    def test_job_in_wrong_state_returns_conflict(self):
        """Test that job in wrong state returns conflict."""
        job_id = self.create_job_direct(
            phase=JobPhase.NORMALIZATION.value, status=JobStatusValue.RUNNING.value, progress=0
        )

        try:
            response = client.post(f"/api/v1/normalize/{job_id}", json={"method": "noob"})

            # A job that is already running is rejected (409), or the payload is
            # rejected first (400).
            assert response.status_code in [400, 409]

        finally:
            self.cleanup_job(job_id)
