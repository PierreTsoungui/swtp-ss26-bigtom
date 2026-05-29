# tests/test_batch.py
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import batch_service
from app.core.error_types import ErrorTypes

# KEINE Exception-Definitionen hier! Der Client nutzt die echte App.
client = TestClient(app, raise_server_exceptions=False)

@pytest.fixture
def mock_job(tmp_path, monkeypatch):
    """Erstellt eine isolierte Test-Umgebung für einen Job."""
    monkeypatch.setattr(batch_service, "JOBS_DIR", tmp_path)
    
    job_id = "test-job-123"
    job_dir = tmp_path / job_id
    job_dir.mkdir()
    
    return job_id, job_dir

# ── GET: HISTORY TESTS ──────────────────────────────────────────────────────

def test_get_batch_history_success(mock_job):
    job_id, _ = mock_job
    
    # Erste Anfrage triggert die automatische Initialisierung der Historie
    response = client.get(f"/api/v1/batch/{job_id}/history")
    assert response.status_code == 200
    
    data = response.json()
    assert data["job_id"] == job_id
    assert data["current_round"] == 1
    assert len(data["rounds"]) == 1
    assert data["rounds"][0]["type"] == "initial"


def test_get_batch_history_job_not_found(mock_job):
    # Wir fragen eine ID ab, die garantiert nicht existiert
    response = client.get("/api/v1/batch/non-existent-job/history")
    
    assert response.status_code == 404
    data = response.json()
    # RFC 9457 Struktur-Validierung
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path
    assert data["title"] == ErrorTypes.JOB_NOT_FOUND.title
    assert "nicht gefunden" in data["detail"]


# ── GET: SVD PLOT TESTS ─────────────────────────────────────────────────────

def test_get_svd_plot_success(mock_job):
    job_id, job_dir = mock_job
    
    # Erstelle einen Fake-Plot im temporären Ordner
    plot_file = job_dir / "svd_plot_0.png"
    plot_file.write_bytes(b"fake_png_binary_data")
    
    response = client.get(f"/api/v1/batch/{job_id}/svd-plot/0")
    assert response.status_code == 200
    assert response.content == b"fake_png_binary_data"
    assert response.headers["content-type"] == "image/png"


def test_get_svd_plot_not_found(mock_job):
    job_id, _ = mock_job
    
    # Runde 99 existiert nicht
    response = client.get(f"/api/v1/batch/{job_id}/svd-plot/99")
    
    assert response.status_code == 404
    data = response.json()
    assert data["type"] == ErrorTypes.PLOT_NOT_FOUND.path
    assert data["status"] == 404


# ── POST: BATCH RUN TESTS ───────────────────────────────────────────────────

def test_run_batch_correction_success(mock_job, monkeypatch):
    job_id, job_dir = mock_job
    
    # Verhindere, dass der echte Background-Worker versucht R aufzurufen
    async def mock_pipeline_task(*args, **kwargs):
        pass
    monkeypatch.setattr(batch_service, "run_batch_pipeline_task", mock_pipeline_task)

    payload = {
        "batch_correction": {
            "batch_variable": "Slide",
            "covariates": ["Sample_Group"]
        }
    }
    
    response = client.post(f"/api/v1/batch/{job_id}", json=payload)
    assert response.status_code == 202
    
    data = response.json()
    assert data["job_id"] == job_id
    assert data["status"] == "running"
    assert data["round"] == 2  # Da Runde 1 initial war, muss jetzt 2 zurückkommen


def test_run_batch_invalid_variable(mock_job):
    job_id, _ = mock_job
    
    payload = {
        "batch_correction": {
            "batch_variable": "Fantasie_Variable_Die_Es_Nicht_Gibt",
            "covariates": []
        }
    }
    
    response = client.post(f"/api/v1/batch/{job_id}", json=payload)
    assert response.status_code == 400
    
    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_BATCH_VARIABLE.path
    assert "available" in data  # Prüft, ob Extra-Details mitgegeben wurden


def test_run_batch_covariate_equals_batch(mock_job):
    job_id, _ = mock_job
    
    payload = {
        "batch_correction": {
            "batch_variable": "Slide",
            "covariates": ["Slide", "Sample_Group"]  # 'Slide' darf nicht in beiden sein!
        }
    }
    
    response = client.post(f"/api/v1/batch/{job_id}", json=payload)
    assert response.status_code == 400
    
    data = response.json()
    assert data["type"] == ErrorTypes.COVARIATE_EQUALS_BATCH.path


# ── POST: SKIP TESTS ────────────────────────────────────────────────────────

def test_skip_batch_correction(mock_job):
    job_id, _ = mock_job
    
    response = client.post(f"/api/v1/batch/{job_id}/skip")
    assert response.status_code == 202
    
    data = response.json()
    assert data["status"] == "batch_done"