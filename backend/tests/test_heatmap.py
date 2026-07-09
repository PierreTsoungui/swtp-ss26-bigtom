# tests/test_heatmap.py

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.error_types import ErrorTypes
from app.main import app
from app.models.job import JobStatus
from app.services import heatmap_service, job_manager

client = TestClient(app, raise_server_exceptions=False)

VALID_JOB_ID = "test-heatmap-job"


# ── Fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def mock_job(tmp_path, monkeypatch):
    """Create an isolated heatmap job: patched JOBS_DIR + an in-memory job.

    The job starts in RESULTS/WAITING, the state from which a heatmap run is
    allowed.
    """
    monkeypatch.setattr(heatmap_service, "JOBS_DIR", tmp_path)
    monkeypatch.setattr(job_manager, "jobs", {})

    job_id = VALID_JOB_ID
    job_dir = tmp_path / job_id
    job_dir.mkdir()

    job_manager.jobs[job_id] = JobStatus(
        job_id=job_id,
        status=job_manager.JobStatusValue.WAITING.value,
        phase=job_manager.JobPhase.RESULTS.value,
        progress_percent=100,
        current_step="Test job",
    )

    return job_id, job_dir


@pytest.fixture
def mock_job_with_samplesheet(mock_job):
    """Extend ``mock_job`` with the DMP artifacts a heatmap run consumes.

    A heatmap run needs the sample sheet (grouping columns), the DMP result RDS
    (``_find_dmp_rds``) and the DMP result CSV (``prepare_heatmap_input`` selects
    the CpGs from it using the same filter layer as the table view).
    """
    job_id, job_dir = mock_job

    (job_dir / "SampleSheet.csv").write_text(
        "[Data],,,,\n"
        "Sample_Name,Sample_Group,Sentrix_ID,Sentrix_Position,Sample_Plate\n"
        "HeLa,Cellline,206891110001,R01C01,Plate_1\n"
        "Jurkat,Cellline,206891110002,R02C01,Plate_1\n"
        "Raji,Coriell,206891110001,R03C01,Plate_1\n"
        "NA12873,Coriell,206891110002,R04C01,Plate_1\n",
        encoding="utf-8",
    )
    (job_dir / "dmp_results.rds").write_bytes(b"fake_rds")
    dmp_rows = "".join(f"cg{i:07d},0.0{i},0.3,chr19\n" for i in range(1, 11))
    (job_dir / "dmp_results.csv").write_text(
        "ID,adj.P.Val,deltaBeta,CHR\n" + dmp_rows, encoding="utf-8"
    )

    return job_id, job_dir


# ── GET /options TESTS ────────────────────────────────────────────────────────


def test_get_heatmap_options_success(mock_job_with_samplesheet):
    """The options endpoint returns every column as a typed annotation candidate.

    The heatmap is permissive: it offers every sample-sheet column and annotates
    each with a type hint (categorical / identifier / continuous) so the frontend
    can render or de-emphasise it appropriately.
    """
    job_id, _ = mock_job_with_samplesheet

    response = client.get(f"/api/v1/heatmap/{job_id}/options")
    assert response.status_code == 200

    data = response.json()
    assert data["job_id"] == job_id
    by_name = {col["name"]: col for col in data["available_columns"]}

    # A low-cardinality biological factor is offered as a categorical annotation.
    assert by_name["Sample_Group"]["type"] == "categorical"
    assert by_name["Sample_Group"]["n_distinct"] == 2
    # A per-sample column is still offered, but flagged as an identifier.
    assert by_name["Sample_Name"]["type"] == "identifier"


def test_get_heatmap_options_job_not_found(mock_job):
    """Test heatmap options for non-existent job."""
    response = client.get("/api/v1/heatmap/non-existent-job/options")

    assert response.status_code == 404
    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path


def test_get_heatmap_options_no_annotatable_columns(mock_job):
    """A sheet whose columns hold no values yields no annotation candidates.

    Only fully empty columns are excluded, so this is the single case in which
    the permissive finder returns an empty list.
    """
    job_id, job_dir = mock_job

    csv_content = "[Data],\n" "Col_A,Col_B\n" ",\n" ",\n"
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")

    response = client.get(f"/api/v1/heatmap/{job_id}/options")
    assert response.status_code == 200

    assert response.json()["available_columns"] == []


# ── POST /{job_id} TESTS ──────────────────────────────────────────────────────


def test_run_heatmap_success(mock_job_with_samplesheet, monkeypatch):
    """Test successful heatmap generation."""
    job_id, _ = mock_job_with_samplesheet

    # Mock the pipeline task to avoid actual execution
    async def mock_pipeline_task(*args, **kwargs):
        pass

    # Patch the actual function that gets called
    monkeypatch.setattr(heatmap_service, "run_heatmap_pipeline_task", mock_pipeline_task)

    payload = {"grouping": {"primary": "Sample_Group"}}

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
            "secondary": "Sentrix_ID",
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

    payload = {"grouping": {"primary": "Sample_Group", "secondary": "Fantasy_Column"}}

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 400

    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path


def test_run_heatmap_primary_equals_secondary(mock_job_with_samplesheet):
    """Test heatmap when primary equals secondary grouping."""
    job_id, _ = mock_job_with_samplesheet

    payload = {"grouping": {"primary": "Sample_Group", "secondary": "Sample_Group"}}

    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 400

    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path


def test_run_heatmap_job_not_found(mock_job):
    """Test heatmap for non-existent job."""
    payload = {"grouping": {"primary": "Sample_Group"}}

    response = client.post("/api/v1/heatmap/non-existent-job", json=payload)
    assert response.status_code == 404

    data = response.json()
    assert data["type"] == ErrorTypes.JOB_NOT_FOUND.path


def test_run_heatmap_session_expired(mock_job_with_samplesheet):
    """Job dir on disk but the in-memory session is gone (e.g. backend restart).

    This must yield a clean RFC 9457 410 response, not the unhandled KeyError /
    raw 500 that previously made the frontend fail with
    "JSON.parse: unexpected character at line 1 column 1". The 410 is raised
    before any pipeline work starts, so no run needs to be mocked.
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

    payload = {"grouping": {"primary": "Sample_Group"}}

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
