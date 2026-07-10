# tests/test_reset.py
"""Reset endpoint: cancelling a job must also delete its data from disk.

These pin the GDPR-relevant guarantee: a successful reset means the job's
directory is gone, and a reset works even after the in-memory record has been
evicted (as long as the directory still exists).
"""

from fastapi.testclient import TestClient

from app.core.error_types import ErrorTypes
from app.main import app
from app.services import file_handler, job_manager
from app.services.job_manager import JobPhase, JobStatus, JobStatusValue

client = TestClient(app, raise_server_exceptions=False)


def _make_job_dir(base, job_id: str):
    """Create a job directory with a dummy data file and return its path."""
    job_dir = base / job_id
    job_dir.mkdir(parents=True)
    (job_dir / "SampleSheet.csv").write_text("dummy", encoding="utf-8")
    (job_dir / "beta.rds").write_bytes(b"\x00\x01")
    return job_dir


def test_reset_deletes_job_directory(tmp_path, monkeypatch):
    """A registered, idle job is deleted from memory AND from disk."""
    monkeypatch.setattr(file_handler, "UPLOAD_BASE_DIR", tmp_path)
    job_id = "reset-job-1"
    job_dir = _make_job_dir(tmp_path, job_id)
    job_manager.jobs[job_id] = JobStatus(
        job_id=job_id,
        status=JobStatusValue.COMPLETED.value,
        phase=JobPhase.RESULTS.value,
        progress_percent=100,
        current_step="done",
        error=None,
    )
    try:
        response = client.post(f"/api/v1/reset/{job_id}")
        assert response.status_code == 200
        assert response.json()["reset"] is True
        # The guarantee: no data remains on disk once the call succeeds.
        assert not job_dir.exists()
        assert job_manager.get_job(job_id) is None
    finally:
        job_manager.jobs.pop(job_id, None)


def test_reset_deletes_directory_when_memory_record_is_gone(tmp_path, monkeypatch):
    """Directory on disk but no in-memory job (e.g. after eviction): still deleted.

    Previously this returned 404 and left the data on disk.
    """
    monkeypatch.setattr(file_handler, "UPLOAD_BASE_DIR", tmp_path)
    job_id = "reset-job-orphan"
    job_dir = _make_job_dir(tmp_path, job_id)
    assert job_manager.get_job(job_id) is None  # not registered

    response = client.post(f"/api/v1/reset/{job_id}")
    assert response.status_code == 200
    assert response.json()["reset"] is True
    assert not job_dir.exists()


def test_reset_unknown_job_returns_404(tmp_path, monkeypatch):
    """No in-memory record and no directory → genuinely not found."""
    monkeypatch.setattr(file_handler, "UPLOAD_BASE_DIR", tmp_path)
    response = client.post("/api/v1/reset/does-not-exist")
    assert response.status_code == 404
    assert response.json()["type"] == ErrorTypes.JOB_NOT_FOUND.path


def test_reset_reports_500_when_deletion_fails(tmp_path, monkeypatch):
    """If the data cannot be deleted, the client must not get a false 'ok'."""
    monkeypatch.setattr(file_handler, "UPLOAD_BASE_DIR", tmp_path)
    job_id = "reset-job-fail"
    _make_job_dir(tmp_path, job_id)

    def _boom(_job_id):
        raise OSError("simulated deletion failure")

    monkeypatch.setattr(file_handler, "delete_job_files", _boom)

    response = client.post(f"/api/v1/reset/{job_id}")
    assert response.status_code == 500
    assert response.json()["type"] == ErrorTypes.RESET_FAILED.path
