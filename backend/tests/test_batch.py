import json
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys
import os

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services import batch_service, job_manager
from app.core.error_types import ErrorTypes
from datetime import datetime, timedelta

client = TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def mock_job(tmp_path, monkeypatch):
    """Create an isolated test environment for a job."""
    # Patch JOBS_DIR in batch_service
    monkeypatch.setattr(batch_service, "JOBS_DIR", tmp_path)
    monkeypatch.setattr(job_manager, "jobs", {})

    job_id = "test-job-123"
    job_dir = tmp_path / job_id
    job_dir.mkdir()
    
    # Create a proper batch_history.json with correct structure
    history_path = job_dir / "batch_history.json"
    initial_history = {
        "job_id": job_id,
        "rounds": [
            {
                "round": 0,
                "type": "initial",
                "svd_plot": f"/api/v1/batch/{job_id}/svd-plot/0",
                "settings_used": None,
                "timestamp": datetime.now().isoformat()
            }
        ],
        "current_round": 0,
        "correction_applied": False
    }
    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(initial_history, f, indent=2)

    # Create a mock job in job_manager
    from app.models.job import JobStatus
    mock_job_obj = JobStatus(
        job_id=job_id,
        status="running",
        phase="svd",
        progress_percent=0,
        current_step="Test job",
        temp_dir=str(job_dir),
        created_at=datetime.now(),
        expires_at=datetime.now() + timedelta(hours=24)
    )
    job_manager.jobs[job_id] = mock_job_obj

    # Also patch get_job to return our mock
    def mock_get_job(jid):
        if jid == job_id:
            return mock_job_obj
        return None
    monkeypatch.setattr(job_manager, "get_job", mock_get_job)

    return job_id, job_dir


@pytest.fixture
def mock_job_for_batch(mock_job, monkeypatch):
    """Extended fixture for batch correction tests."""
    job_id, job_dir = mock_job

    # Create valid sample sheet
    csv_content = "[Data],,\nSlide,Sample_Group\nChip1,A\nChip2,B\nChip1,A"
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")

    # Mock the pipeline tasks to avoid actual execution
    async def mock_pipeline_task(*args, **kwargs):
        pass

    # Patch the tasks that actually exist in batch_service
    monkeypatch.setattr(batch_service, "run_batch_pipeline_task", mock_pipeline_task)
    monkeypatch.setattr(batch_service, "run_downstream_analysis_task", mock_pipeline_task)

    # Ensure the job is in the right phase
    job_manager.jobs[job_id].phase = "batch"
    job_manager.jobs[job_id].status = "waiting"

    return job_id, job_dir


# ── GET: HISTORY TESTS ──────────────────────────────────────────────────────

def test_get_batch_history_success(mock_job):
    """Test successful history retrieval."""
    job_id, _ = mock_job
    
    response = client.get(f"/api/v1/batch/{job_id}/history")
    assert response.status_code == 200
    
    data = response.json()
    assert data["job_id"] == job_id
    assert data["current_round"] == 0
    assert len(data["rounds"]) == 1
    assert data["rounds"][0]["type"] == "initial"


def test_get_batch_history_job_not_found(mock_job):
    """Test history retrieval for non-existent job."""
    response = client.get("/api/v1/batch/non-existent-job/history")
    assert response.status_code == 404


# ── GET: SVD PLOT TESTS ─────────────────────────────────────────────────────

def test_get_svd_plot_success(mock_job):
    """Test successful SVD plot retrieval."""
    job_id, job_dir = mock_job
    
    plot_file = job_dir / "svd_plot_0.png"
    plot_file.write_bytes(b"fake_png_binary_data")
    
    response = client.get(f"/api/v1/batch/{job_id}/svd-plot/0")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_get_svd_plot_pdf_download(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "svd_plot_0.pdf").write_bytes(b"%PDF-1.4 fake")

    response = client.get(f"/api/v1/batch/{job_id}/svd-plot/0", params={"format": "pdf"})
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert "attachment" in response.headers.get("content-disposition", "")


def test_get_svd_plot_not_found(mock_job):
    """Test SVD plot retrieval for non-existent plot."""
    job_id, _ = mock_job
    response = client.get(f"/api/v1/batch/{job_id}/svd-plot/99")
    assert response.status_code == 404


# ── GET: BATCH OPTIONS TESTS ────────────────────────────────────────────────

def test_get_batch_options_success(mock_job):
    """Test successful retrieval of batch options."""
    job_id, job_dir = mock_job

    csv_content = (
        "[Data],,,\n"
        "Sample_Name,Sample_Group,Slide,Sample_Plate\n"
        "Sample_A,Cellline,Chip_1,Plate_1\n"
        "Sample_B,Coriell,Chip_2,Plate_1\n"
        "Sample_C,Cellline,Chip_1,Plate_1\n"
    )
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")
    
    response = client.get(f"/api/v1/batch/{job_id}/batch-options")
    assert response.status_code == 200
    
    data = response.json()
    assert data["job_id"] == job_id
    assert "Slide" in data["available_columns"]
    assert "Sample_Group" in data["available_columns"]


def test_get_batch_options_all_filtered(mock_job):
    """Test batch options when all columns are filtered out."""
    job_id, job_dir = mock_job

    csv_content = (
        "[Data],,\n"
        "Sample_ID,Project_Group,Barcode\n"
        "Sample_01,Studie_2026,BC_991\n"
        "Sample_02,Studie_2026,BC_992\n"
        "Sample_03,Studie_2026,BC_993\n"
    )
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")
    
    response = client.get(f"/api/v1/batch/{job_id}/batch-options")
    assert response.status_code == 200
    assert response.json()["available_columns"] == []


# ── POST: BATCH RUN TESTS ───────────────────────────────────────────────────

def test_run_batch_correction_success(mock_job_for_batch):
    """Test successful batch correction run."""
    job_id, _ = mock_job_for_batch

    payload = {
        "batch_correction": {
            "batch_variable": "Slide",
            "covariates": ["Sample_Group"]
        }
    }
    
    response = client.post(f"/api/v1/batch/{job_id}", json=payload)
    assert response.status_code in [202, 409]


def test_run_batch_invalid_variable(mock_job):
    """Test batch correction with invalid batch variable."""
    job_id, job_dir = mock_job

    csv_content = "[Data],,\nSlide,Sample_Group\nChip1,A\nChip2,B\nChip1,A"
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")
    
    payload = {
        "batch_correction": {
            "batch_variable": "Invalid_Variable",
            "covariates": []
        }
    }
    
    response = client.post(f"/api/v1/batch/{job_id}", json=payload)
    assert response.status_code in [400, 404, 409]


def test_run_batch_covariate_equals_batch(mock_job):
    """Test batch correction when covariate equals batch variable."""
    job_id, job_dir = mock_job
    
    csv_content = "[Data],,\nSlide,Sample_Group\nChip1,A\nChip2,B\nChip1,A"
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")
    
    payload = {
        "batch_correction": {
            "batch_variable": "Slide",
            "covariates": ["Slide", "Sample_Group"]
        }
    }
    
    response = client.post(f"/api/v1/batch/{job_id}", json=payload)
    assert response.status_code in [400, 409]


# ── POST: SKIP TESTS ────────────────────────────────────────────────────────

def test_skip_batch_correction(mock_job_for_batch):
    """Test skipping batch correction."""
    job_id, _ = mock_job_for_batch
    
    response = client.post(f"/api/v1/batch/{job_id}/skip")
    assert response.status_code in [202, 409]


# ── ADDITIONAL: Test batch correction failure cases ────────────────────────

def test_run_batch_without_samplesheet(mock_job):
    """Test batch correction when sample sheet is missing."""
    job_id, job_dir = mock_job
    
    # Remove the sample sheet
    sheet_path = job_dir / "SampleSheet.csv"
    if sheet_path.exists():
        sheet_path.unlink()

    payload = {
        "batch_correction": {
            "batch_variable": "Slide",
            "covariates": []
        }
    }

    response = client.post(f"/api/v1/batch/{job_id}", json=payload)
    assert response.status_code in [400, 404, 409]