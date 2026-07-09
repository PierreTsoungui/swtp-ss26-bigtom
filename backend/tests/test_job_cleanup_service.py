"""Tests for the automatic cleanup of expired job data.

This test module ensures that the cleanup service correctly deletes old job
directories, keeps recent job directories, handles errors robustly, and is
automatically started via the FastAPI lifespan.
"""

import asyncio
import os
import time
from unittest.mock import AsyncMock

import pytest

import app.main as main_module
from app.services import job_cleanup_service
from app.services.job_cleanup_service import (
    cleanup_expired_jobs,
    run_job_cleanup_loop,
)


def set_age(path, age_seconds):
    """Artificially set the modification time of a file or directory.

    Why?
    For cleanup tests, job directories need to be simulated as older than
    the configured retention period.
    """
    timestamp = time.time() - age_seconds
    os.utime(path, (timestamp, timestamp))


def test_expired_job_directory_is_deleted(tmp_path):
    """Test that an expired job directory is deleted.

    Creates a job directory, sets its modification time to two hours ago,
    and uses a retention period of one hour. The directory should be
    considered expired and deleted.
    """
    job_dir = tmp_path / "expired-job"
    job_dir.mkdir()
    (job_dir / "result.csv").write_text("result", encoding="utf-8")

    # Artificially age the directory beyond the retention period
    set_age(job_dir, age_seconds=2 * 3600)

    deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 1
    assert not job_dir.exists()


def test_recent_job_directory_is_kept(tmp_path):
    """Test that a recent job directory is preserved.

    The job directory is only 30 minutes old. With a retention period of
    one hour, it should not be deleted.
    """
    job_dir = tmp_path / "recent-job"
    job_dir.mkdir()

    # Directory is younger than the configured retention period
    set_age(job_dir, age_seconds=30 * 60)

    deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 0
    assert job_dir.exists()


def test_missing_jobs_directory_does_not_fail(tmp_path):
    """Test that a missing job directory does not cause an error.

    Why?
    When the backend starts for the first time or in certain test environments,
    the job directory may not exist yet. The cleanup must not crash.
    """
    missing_dir = tmp_path / "missing"

    deleted_count = cleanup_expired_jobs(missing_dir, retention_hours=1)

    assert deleted_count == 0


def test_regular_files_are_ignored(tmp_path):
    """Test that regular files in the job directory are ignored.

    The cleanup service should only delete job directories. Individual files
    in the base directory must not be removed.
    """
    regular_file = tmp_path / "keep-me.txt"
    regular_file.write_text("not a job", encoding="utf-8")

    # Even if the file is old, it must not be deleted because the cleanup
    # only removes directories.
    set_age(regular_file, age_seconds=2 * 3600)

    deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 0
    assert regular_file.exists()


def test_cleanup_logs_deleted_directory(tmp_path, caplog):
    """Test that deleting a job directory is logged.

    This is important so that deletion operations are traceable later.
    """
    job_dir = tmp_path / "expired-job"
    job_dir.mkdir()

    # Directory is older than the retention period and must be deleted
    set_age(job_dir, age_seconds=2 * 3600)

    with caplog.at_level("INFO"):
        deleted_count = cleanup_expired_jobs(tmp_path, retention_hours=1)

    assert deleted_count == 1
    assert "Deleted expired job directory" in caplog.text
    assert "deleted 1 expired directory" in caplog.text


def test_cleanup_loop_continues_after_unexpected_error(monkeypatch, caplog):
    """Test that unexpected errors in cleanup are logged.

    The cleanup loop must not silently stop when an error occurs during
    cleanup. An error is simulated and then checked for proper logging.
    """
    cleanup_calls = 0

    def failing_cleanup(*args):
        """Simulate an error during cleanup."""
        nonlocal cleanup_calls
        cleanup_calls += 1
        raise RuntimeError("cleanup failed")

    async def stop_after_first_iteration(_interval):
        """Stop the loop after the first iteration for controlled testing."""
        raise asyncio.CancelledError

    # Replace the real cleanup function with a failing one
    monkeypatch.setattr(job_cleanup_service, "cleanup_expired_jobs", failing_cleanup)

    # Replace asyncio.sleep so the test doesn't actually wait
    monkeypatch.setattr(
        job_cleanup_service.asyncio,
        "sleep",
        AsyncMock(side_effect=stop_after_first_iteration),
    )

    with caplog.at_level("ERROR"), pytest.raises(asyncio.CancelledError):
        asyncio.run(run_job_cleanup_loop(interval_seconds=1))

    assert cleanup_calls == 1
    assert "Unexpected error during job cleanup" in caplog.text


def test_lifespan_starts_cleanup_task(monkeypatch):
    """Test that the cleanup service starts automatically with FastAPI.

    The real cleanup loop is replaced with a controlled test function.
    This verifies that FastAPI creates a background task for cleanup on
    startup and stops it on shutdown.
    """

    async def exercise_lifespan():
        """Execute the FastAPI lifespan within the test."""
        started = asyncio.Event()
        keep_running = asyncio.Event()

        async def fake_cleanup_loop(*args, **kwargs):
            """Simulate a continuously running cleanup loop.

            Accepts arbitrary arguments because ``lifespan`` starts the loop once
            for the job directory and again (with keyword arguments) for the
            staging directory.
            """
            started.set()
            await keep_running.wait()

        # Replace the real cleanup loop to keep the test controllable
        monkeypatch.setattr(
            main_module,
            "run_job_cleanup_loop",
            fake_cleanup_loop,
        )

        async with main_module.lifespan(main_module.app):
            await asyncio.wait_for(started.wait(), timeout=1)
            cleanup_task = main_module.app.state.job_cleanup_task

            # During application runtime, the cleanup task must be active
            assert not cleanup_task.done()

        # After exiting the lifespan, the task must be properly cancelled
        assert cleanup_task.cancelled()

    asyncio.run(exercise_lifespan())
