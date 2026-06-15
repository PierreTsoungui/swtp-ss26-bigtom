# tests/test_heatmap.py

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import heatmap_service
from app.core.error_types import ErrorTypes

client = TestClient(app, raise_server_exceptions=False)

VALID_JOB_ID = "test-heatmap-job"

# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_job(tmp_path, monkeypatch):
    """Erstellt eine isolierte Test-Umgebung für einen Heatmap-Job."""
    monkeypatch.setattr(heatmap_service, "JOBS_DIR", tmp_path)

    job_dir = tmp_path / VALID_JOB_ID
    job_dir.mkdir()

    return VALID_JOB_ID, job_dir


@pytest.fixture
def mock_job_with_samplesheet(mock_job):
    """Erweiterung: Job-Verzeichnis mit gültigem SampleSheet und DMP-RDS."""
    job_id, job_dir = mock_job

    csv_content = (
        "[Data],,,,\n"
        "Sample_Name,Sample_Group,Sentrix_ID,Sentrix_Position,Sample_Plate\n"
        "HeLa,Cellline,206891110001,R01C01,Plate_1\n"
        "Jurkat,Cellline,206891110002,R02C01,Plate_1\n"
        "Raji,Coriell,206891110001,R03C01,Plate_1\n"
        "NA12873,Coriell,206891110002,R04C01,Plate_1\n"
    )
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")

    # Minimale Fake-RDS damit _find_dmp_rds() die Datei findet
    (job_dir / "dmp_results.rds").write_bytes(b"fake_rds")

    return job_id, job_dir


# ── GET /options TESTS ────────────────────────────────────────────────────────

def test_get_heatmap_options_success(mock_job_with_samplesheet):
    job_id, _ = mock_job_with_samplesheet

    response = client.get(f"/api/v1/heatmap/{job_id}/options")
    assert response.status_code == 200

    data = response.json()
    assert data["job_id"] == job_id
    # Sample_Group und Sentrix_ID haben ≥2 Gruppen, jeder Wert mind. 2×
    assert "Sample_Group" in data["available_columns"]
    # Sample_Name ist einzigartig → muss rausgefiltert werden
    assert "Sample_Name" not in data["available_columns"]
    # Sample_Plate ist konstant → muss rausgefiltert werden
    assert "Sample_Plate" not in data["available_columns"]


def test_get_heatmap_options_job_not_found(mock_job):
    response = client.get("/api/v1/heatmap/non-existent-job/options")

    assert response.status_code == 404
    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path
    assert data["title"] == ErrorTypes.JOB_NOT_FOUND.title
    assert "nicht gefunden" in data["detail"]


def test_get_heatmap_options_all_filtered(mock_job):
    job_id, job_dir = mock_job

    # Alle Spalten entweder einzigartig oder konstant → leere Liste erwartet
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
    job_id, _ = mock_job_with_samplesheet

    async def mock_pipeline_task(*args, **kwargs):
        pass
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
    assert "heatmap_metadata" in data


def test_run_heatmap_with_secondary_grouping(mock_job_with_samplesheet, monkeypatch):
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
    job_id, _ = mock_job_with_samplesheet

    payload = {
        "grouping": {"primary": "Spalte_Die_Nicht_Existiert"},
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 400

    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path
    assert "available" in data


def test_run_heatmap_invalid_secondary_column(mock_job_with_samplesheet):
    job_id, _ = mock_job_with_samplesheet

    payload = {
        "grouping": {
            "primary": "Sample_Group",
            "secondary": "Fantasie_Spalte"
        }
    }

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 400

    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path


def test_run_heatmap_primary_equals_secondary(mock_job_with_samplesheet):
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
    assert "identisch" in data["detail"]


def test_run_heatmap_job_not_found(mock_job):
    payload = {
        "grouping": {"primary": "Sample_Group"}
    }

    response = client.post("/api/v1/heatmap/non-existent-job", json=payload)
    assert response.status_code == 404

    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path


def test_run_heatmap_no_dmp_rds(mock_job):
    job_id, job_dir = mock_job

    # SampleSheet vorhanden, aber keine dmp_results.rds
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
    job_id, job_dir = mock_job

    png_path = job_dir / "heatmap.png"
    png_path.write_bytes(b"\x89PNG\r\n\x1a\n")  # Minimaler PNG-Header

    response = client.get(f"/api/v1/heatmap/{job_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"\x89PNG\r\n\x1a\n"


def test_get_heatmap_png_not_yet_generated(mock_job):
    job_id, _ = mock_job

    # Kein heatmap.png vorhanden → 404
    response = client.get(f"/api/v1/heatmap/{job_id}")
    assert response.status_code == 404

    data = response.json()
    assert data["type"] == ErrorTypes.PLOT_NOT_FOUND.path
    assert job_id in data["detail"]


def test_get_heatmap_png_job_not_found(mock_job):
    response = client.get("/api/v1/heatmap/non-existent-job")

    assert response.status_code == 404
    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path