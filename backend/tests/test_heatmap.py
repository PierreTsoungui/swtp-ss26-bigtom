# tests/test_heatmap.py

import json
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys
import os

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services import heatmap_service, job_manager
from app.core.error_types import ErrorTypes
from datetime import datetime, timedelta

client = TestClient(app, raise_server_exceptions=False)

VALID_JOB_ID = "test-heatmap-job"


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_job(tmp_path, monkeypatch):
    """Create an isolated test environment for a heatmap job."""
    monkeypatch.setattr(heatmap_service, "JOBS_DIR", tmp_path)
    monkeypatch.setattr(job_manager, "jobs", {})

    job_id = VALID_JOB_ID
    job_dir = tmp_path / job_id
    job_dir.mkdir()

    # Create a mock job in job_manager - must be in "waiting" state
    from app.models.job import JobStatus
    mock_job_obj = JobStatus(
        job_id=job_id,
        status="waiting",
        phase="results",
        progress_percent=100,
        current_step="Test job",
        temp_dir=str(job_dir),
        created_at=datetime.now(),
        expires_at=datetime.now() + timedelta(hours=24)
    )
    job_manager.jobs[job_id] = mock_job_obj

    return job_id, job_dir


@pytest.fixture
def mock_job_with_samplesheet(mock_job):
    """Extended fixture: job directory with valid sample sheet and DMP RDS."""
    job_id, job_dir = mock_job

    # Ensure job is in the correct state for heatmap transition
    job_manager.jobs[job_id].status = "waiting"
    job_manager.jobs[job_id].phase = "results"

    csv_content = (
        "[Data],,,,\n"
        "Sample_Name,Sample_Group,Sentrix_ID,Sentrix_Position,Sample_Plate\n"
        "HeLa,Cellline,206891110001,R01C01,Plate_1\n"
        "Jurkat,Cellline,206891110002,R02C01,Plate_1\n"
        "Raji,Coriell,206891110001,R03C01,Plate_1\n"
        "NA12873,Coriell,206891110002,R04C01,Plate_1\n"
    )
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")

    # Minimal fake RDS file so _find_dmp_rds() finds it
    (job_dir / "dmp_results.rds").write_bytes(b"fake_rds")

    return job_id, job_dir


# ── GET /options TESTS ────────────────────────────────────────────────────────

def test_get_heatmap_options_success(mock_job_with_samplesheet):
    """Test successful retrieval of heatmap options."""
    job_id, _ = mock_job_with_samplesheet

    response = client.get(f"/api/v1/heatmap/{job_id}/options")
    assert response.status_code == 200

    data = response.json()
    assert data["job_id"] == job_id
    assert "Sample_Group" in data["available_columns"]
    assert "Sample_Name" not in data["available_columns"]
    assert "Sample_Plate" not in data["available_columns"]


def test_get_heatmap_options_job_not_found(mock_job):
    """Test heatmap options for non-existent job."""
    response = client.get("/api/v1/heatmap/non-existent-job/options")

    assert response.status_code == 404
    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path


def test_get_heatmap_options_all_filtered(mock_job):
    """Test heatmap options when all columns are filtered out."""
    job_id, job_dir = mock_job

    csv_content = (
        "[Data],,,\n"
        "Sample_Name,Project,Barcode\n"
        "Sample_01,Studie_2026,BC_991\n"
        "Sample_02,Studie_2026,BC_992\n"
        "Sample_03,Studie_2026,BC_993\n"
    )
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")

    response = client.get(f"/api/v1/heatmap/{job_id}/options")
    assert response.status_code == 200

    data = response.json()
    assert data["available_columns"] == []


# ── POST /{job_id} TESTS ──────────────────────────────────────────────────────

def test_run_heatmap_success(mock_job_with_samplesheet, monkeypatch):
    """Test successful heatmap generation."""
    job_id, _ = mock_job_with_samplesheet

    # Mock the pipeline task to avoid actual execution
    async def mock_pipeline_task(*args, **kwargs):
        pass

    # Patch the actual function that gets called
    monkeypatch.setattr(heatmap_service, "run_heatmap_pipeline_task", mock_pipeline_task)

    payload = {
        "grouping": {"primary": "Sample_Group"},
        "dmp_filter": {
            "chromosome": "chr19",
            "start": 53700000,
            "stop": 54700000
        }
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 202

    data = response.json()
    assert data["job_id"] == job_id
    assert data["status"] == "running"
    assert data["phase"] == "heatmap"


def test_run_heatmap_with_secondary_grouping(mock_job_with_samplesheet, monkeypatch):
    """Test heatmap with secondary grouping."""
    job_id, _ = mock_job_with_samplesheet

    async def mock_pipeline_task(*args, **kwargs):
        pass
    monkeypatch.setattr(heatmap_service, "run_heatmap_pipeline_task", mock_pipeline_task)

    payload = {
        "grouping": {
            "primary": "Sample_Group",
            "secondary": "Sentrix_ID"
        },
        "dmp_filter": {
            "adj_p_value_max": 0.05,
            "delta_beta_min": 0.2
        }
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 202

    data = response.json()
    assert data["status"] == "running"


def test_run_heatmap_invalid_primary_column(mock_job_with_samplesheet):
    """Test heatmap with invalid primary grouping column."""
    job_id, _ = mock_job_with_samplesheet

    payload = {
        "grouping": {"primary": "Column_That_Does_Not_Exist"},
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 400

    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path


def test_run_heatmap_invalid_secondary_column(mock_job_with_samplesheet):
    """Test heatmap with invalid secondary grouping column."""
    job_id, _ = mock_job_with_samplesheet

    payload = {
        "grouping": {
            "primary": "Sample_Group",
            "secondary": "Fantasy_Column"
        }
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 400

    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path


def test_run_heatmap_primary_equals_secondary(mock_job_with_samplesheet):
    """Test heatmap when primary equals secondary grouping."""
    job_id, _ = mock_job_with_samplesheet

    payload = {
        "grouping": {
            "primary": "Sample_Group",
            "secondary": "Sample_Group"
        }
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 400

    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path


def test_run_heatmap_job_not_found(mock_job):
    """Test heatmap for non-existent job."""
    payload = {
        "grouping": {"primary": "Sample_Group"}
    }

    response = client.post("/api/v1/heatmap/non-existent-job", json=payload)
    assert response.status_code == 404

    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path


def test_run_heatmap_session_expired(mock_job_with_samplesheet, no_run):
    """Job dir on disk but the in-memory session is gone (e.g. backend restart).

    This must yield a clean RFC 9457 410 response, not the unhandled KeyError /
    raw 500 that previously made the frontend fail with
    "JSON.parse: unexpected character at line 1 column 1".
    """
    job_id, _ = mock_job_with_samplesheet
    # Simulate the lost session: files remain, but the job manager forgot the job.
    job_manager.jobs.pop(job_id, None)

    response = client.post(
        f"/api/v1/heatmap/{job_id}",
        json={"grouping": {"primary": "Sample_Group"}, "filters": {"chr": "chr19"}},
    )
    assert response.status_code == 410
    body = response.json()
    assert body["type"] == ErrorTypes.SESSION_EXPIRED.path
    assert body["detail"]  # a human-readable message is present


def test_run_heatmap_no_dmp_rds(mock_job):
    """Test heatmap when DMP RDS is missing."""
    job_id, job_dir = mock_job

    # Sample sheet exists but no dmp_results.rds
    csv_content = (
        "[Data],,\n"
        "Sample_Name,Sample_Group,Sentrix_ID\n"
        "HeLa,Cellline,206891110001\n"
        "Jurkat,Cellline,206891110002\n"
        "Raji,Coriell,206891110001\n"
        "NA12873,Coriell,206891110002\n"
    )
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")

    payload = {
        "grouping": {"primary": "Sample_Group"}
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 404

    data = response.json()
    assert data["type"] == ErrorTypes.FILE_NOT_FOUND.path


# ── GET /{job_id} (PNG) TESTS ─────────────────────────────────────────────────

def test_get_heatmap_png_success(mock_job):
    """Test successful PNG retrieval."""
    job_id, job_dir = mock_job

    png_path = job_dir / "heatmap.png"
    png_path.write_bytes(b"\x89PNG\r\n\x1a\n")  # Minimal PNG header

    response = client.get(f"/api/v1/heatmap/{job_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"\x89PNG\r\n\x1a\n"


def test_get_heatmap_png_not_yet_generated(mock_job):
    """Test PNG retrieval when heatmap is not yet generated."""
    job_id, _ = mock_job

    # No heatmap.png exists -> 404
    response = client.get(f"/api/v1/heatmap/{job_id}")
    assert response.status_code == 404

    data = response.json()
    assert data["type"] == ErrorTypes.PLOT_NOT_FOUND.path


def test_get_heatmap_png_job_not_found(mock_job):
    """Test PNG retrieval for non-existent job."""
    response = client.get("/api/v1/heatmap/non-existent-job")
    assert response.status_code == 404

    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path

    