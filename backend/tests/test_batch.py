import json
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import batch_service
from app.core.error_types import ErrorTypes

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
    
    response = client.get(f"/api/v1/batch/{job_id}/history")
    assert response.status_code == 200
    
    data = response.json()
    assert data["job_id"] == job_id
    assert data["current_round"] == 1
    assert len(data["rounds"]) == 1
    assert data["rounds"][0]["type"] == "initial"


def test_get_batch_history_job_not_found(mock_job):
    response = client.get("/api/v1/batch/non-existent-job/history")
    
    assert response.status_code == 404
    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path
    assert data["title"] == ErrorTypes.JOB_NOT_FOUND.title
    assert "nicht gefunden" in data["detail"]


# ── GET: SVD PLOT TESTS (static PNG + vector PDF) ────────────────────────────

def test_get_svd_plot_png(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "svd_plot_0.png").write_bytes(b"\x89PNG\r\n_fake")

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
    job_id, _ = mock_job

    response = client.get(f"/api/v1/batch/{job_id}/svd-plot/99")

    assert response.status_code == 404
    data = response.json()
    assert data["type"] == ErrorTypes.PLOT_NOT_FOUND.path
    assert data["status"] == 404


# ── GET: BATCH OPTIONS TESTS (NEU!) ─────────────────────────────────────────

def test_get_batch_options_success(mock_job):
    job_id, job_dir = mock_job
    
    # Mix aus gültigen (Slide, Group) und ungültigen (Name=einzigartig, Plate=konstant) Spalten
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
    # Nur die mathematisch sinnvollen Spalten dürfen ankommen
    assert "Slide" in data["available_columns"]
    assert "Sample_Group" in data["available_columns"]
    assert "Sample_Name" not in data["available_columns"]
    assert "Sample_Plate" not in data["available_columns"]


def test_get_batch_options_all_filtered(mock_job):
    job_id, job_dir = mock_job
    
    # Deine "Chaos-CSV": Nur Spalten, die komplett einzigartig oder komplett konstant sind
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
    
    data = response.json()
    # Erwartung: Eine leere Liste, weil alles rausgefiltert wurde!
    assert data["available_columns"] == []


# ── POST: BATCH RUN TESTS ───────────────────────────────────────────────────

def test_run_batch_correction_success(mock_job, monkeypatch):
    job_id, job_dir = mock_job
    
    # Bereite gültiges Samplesheet für die Validierung vor
    csv_content = "[Data],,\nSlide,Sample_Group\nChip1,A\nChip2,B\nChip1,A"
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")
    
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
    assert data["round"] == 2


def test_run_batch_invalid_variable(mock_job):
    job_id, job_dir = mock_job
    
    # Samplesheet existiert, enthält aber die Fantasie-Variable nicht
    csv_content = "[Data],,\nSlide,Sample_Group\nChip1,A\nChip2,B\nChip1,A"
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")
    
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
    assert "available" in data


def test_run_batch_covariate_equals_batch(mock_job):
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
    assert response.status_code == 400
    
    data = response.json()
    assert data["type"] == ErrorTypes.COVARIATE_EQUALS_BATCH.path


# ── POST: SKIP TESTS ────────────────────────────────────────────────────────

# ── POST: SKIP TESTS ────────────────────────────────────────────────────────

def test_skip_batch_correction(mock_job, monkeypatch):
    job_id, _ = mock_job
    
    # Verhindere, dass die Downstream-Pipeline im Hintergrund echt anspringt
    # und nach Dateien sucht, die im Test-Ordner nicht existieren.
    if hasattr(batch_service, "run_downstream_pipeline_task"):
        monkeypatch.setattr(batch_service, "run_downstream_pipeline_task", lambda *args, **kwargs: None)
    elif hasattr(batch_service, "skip_batch_pipeline_task"):
        monkeypatch.setattr(batch_service, "skip_batch_pipeline_task", lambda *args, **kwargs: None)
    
    response = client.post(f"/api/v1/batch/{job_id}/skip")
    assert response.status_code == 202
    
    data = response.json()
    # Das Backend liefert "running", da die Downstream-Analyse im Hintergrund startet!
    assert data["status"] == "running"

# ── NEW: columns-with-levels + sample-sheet preview ──────────────────────────

_EPIC_SHEET = (
    "[Data]\n"
    "Sample_Name,Sample_Group,Sentrix_ID,Sentrix_Position\n"
    "HeLa,Cellline,206891110001,R01C01\n"
    "Jurkat,Cellline,206891110001,R03C01\n"
    "NA12873,Coriell,206891110001,R08C01\n"
    "HeLa_2,Cellline,206891110002,R01C01\n"
)


def test_batch_options_returns_columns_with_levels(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "SampleSheet.csv").write_text(_EPIC_SHEET, encoding="utf-8")

    data = client.get(f"/api/v1/batch/{job_id}/batch-options").json()

    by_name = {c["name"]: c["levels"] for c in data["columns"]}
    # Same set offered for both roles; Sample_Name is unique → excluded.
    # Sentrix_Position has 3 distinct values (R01C01, R03C01, R08C01).
    assert by_name == {"Sample_Group": 2, "Sentrix_ID": 2, "Sentrix_Position": 3}
    assert "Sample_Name" not in by_name
    assert set(data["available_columns"]) == set(by_name)


def test_sample_sheet_preview(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "SampleSheet.csv").write_text(_EPIC_SHEET, encoding="utf-8")

    data = client.get(f"/api/v1/batch/{job_id}/sample-sheet").json()

    assert data["columns"] == ["Sample_Name", "Sample_Group", "Sentrix_ID", "Sentrix_Position"]
    assert data["total_rows"] == 4
    assert data["rows"][0] == ["HeLa", "Cellline", "206891110001", "R01C01"]


def test_batch_options_includes_group_values(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "SampleSheet.csv").write_text(_EPIC_SHEET, encoding="utf-8")

    data = client.get(f"/api/v1/batch/{job_id}/batch-options").json()
    by_name = {c["name"]: c for c in data["columns"]}
    assert sorted(by_name["Sample_Group"]["values"]) == ["Cellline", "Coriell"]


def test_skip_rejects_invalid_group_selection(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "SampleSheet.csv").write_text(_EPIC_SHEET, encoding="utf-8")

    # control group value does not exist in the chosen column
    resp = client.post(f"/api/v1/batch/{job_id}/skip", json={
        "group_column": "Sample_Group",
        "case_group": "Cellline",
        "control_group": "DoesNotExist",
    })
    assert resp.status_code == 400
    assert resp.json()["type"] == ErrorTypes.INVALID_SELECTION.path


def test_skip_rejects_unknown_group_column(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "SampleSheet.csv").write_text(_EPIC_SHEET, encoding="utf-8")

    resp = client.post(f"/api/v1/batch/{job_id}/skip", json={
        "group_column": "NopeColumn",
        "case_group": "A",
        "control_group": "B",
    })
    assert resp.status_code == 400
    assert resp.json()["type"] == ErrorTypes.INVALID_BATCH_VARIABLE.path
