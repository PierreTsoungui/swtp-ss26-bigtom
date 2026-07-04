# tests/test_heatmap.py

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import heatmap_service, job_manager
from app.services.job_manager import JobStatus, JobPhase, JobStatusValue
from app.core.error_types import ErrorTypes

client = TestClient(app, raise_server_exceptions=False)

VALID_JOB_ID = "test-heatmap-job"

_DMP_CSV = (
    "ID,CHR,POS,GENE,FEATURE,CGI,ADJ_P,GROUP1_AVG,GROUP2_AVG,DELTA_BETA,LOG_FC,DMR_ID\n"
    "cg1,chr19,100,G1,Body,Island,0.01,0.9,0.1,0.8,3.0,DMR_1\n"
    "cg2,chr1,200,G2,TSS1500,Shore,0.50,0.5,0.4,0.1,0.2,-\n"
    "cg3,chr19,300,G3,IGR,OpenSea,0.20,0.7,0.3,0.4,1.0,DMR_2\n"
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_job(tmp_path, monkeypatch):
    """Isolated heatmap-job environment with the job registered in (RESULTS, WAITING)."""
    monkeypatch.setattr(heatmap_service, "JOBS_DIR", tmp_path)
    job_dir = tmp_path / VALID_JOB_ID
    job_dir.mkdir()

    # A heatmap may only be started from (RESULTS, WAITING).
    job_manager.jobs[VALID_JOB_ID] = JobStatus(
        job_id=VALID_JOB_ID,
        status=JobStatusValue.WAITING.value,
        phase=JobPhase.RESULTS.value,
        progress_percent=100,
        current_step="results ready",
        error=None,
    )
    try:
        yield VALID_JOB_ID, job_dir
    finally:
        job_manager.jobs.pop(VALID_JOB_ID, None)


@pytest.fixture
def mock_job_with_samplesheet(mock_job):
    """Job dir with a valid sample sheet, DMP results (csv + rds)."""
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
    (job_dir / "dmp_results.csv").write_text(_DMP_CSV, encoding="utf-8")
    (job_dir / "dmp_results.rds").write_bytes(b"fake_rds")

    return job_id, job_dir


@pytest.fixture
def no_run(monkeypatch):
    """Stub the R pipeline task so POST returns without launching R."""
    async def _noop(*args, **kwargs):
        pass
    monkeypatch.setattr(heatmap_service, "run_heatmap_pipeline_task", _noop)


# ── GET /options ──────────────────────────────────────────────────────────────

def test_get_heatmap_options_returns_all_nonempty_columns(mock_job_with_samplesheet):
    """Permissive finder: every non-empty column is offered, with a type hint."""
    job_id, _ = mock_job_with_samplesheet

    response = client.get(f"/api/v1/heatmap/{job_id}/options")
    assert response.status_code == 200

    cols = response.json()["available_columns"]
    names = {c["name"] for c in cols}
    # All non-empty columns are present — incl. ones the strict finder dropped:
    assert {"Sample_Name", "Sample_Group", "Sentrix_ID", "Sentrix_Position", "Sample_Plate"} <= names
    # Each entry carries name + type + n_distinct.
    for c in cols:
        assert set(c.keys()) == {"name", "type", "n_distinct"}
    by_name = {c["name"]: c for c in cols}
    assert by_name["Sample_Name"]["type"] == "identifier"     # one value per sample
    assert by_name["Sample_Group"]["type"] == "categorical"


def test_get_heatmap_options_continuous_column(mock_job):
    """A numeric column with many distinct values is flagged 'continuous'."""
    job_id, job_dir = mock_job
    sheet = "[Data],\nSample_Name,age\n" + "".join(
        f"S{i},{20 + i}\n" for i in range(15)
    )
    (job_dir / "SampleSheet.csv").write_text(sheet, encoding="utf-8")

    cols = client.get(f"/api/v1/heatmap/{job_id}/options").json()["available_columns"]
    by_name = {c["name"]: c for c in cols}
    assert by_name["age"]["type"] == "continuous"


def test_get_heatmap_options_job_not_found(mock_job):
    response = client.get("/api/v1/heatmap/non-existent-job/options")
    assert response.status_code == 404
    assert response.json()["type"] == ErrorTypes.JOB_NOT_FOUND.path


# ── POST /{job_id} ────────────────────────────────────────────────────────────

def test_run_heatmap_success_writes_input(mock_job_with_samplesheet, no_run):
    job_id, job_dir = mock_job_with_samplesheet

    payload = {"grouping": {"primary": "Sample_Group"}, "filters": {"chr": "chr19"}}
    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 202

    data = response.json()
    assert data["status"] == "running"
    assert data["phase"] == "heatmap"
    # chr19 selects cg1 + cg3 → the filtered CpG list handed to R has 2 rows.
    assert data["heatmap_metadata"]["detected_cpgs"] == 2
    written = (job_dir / "heatmap_input.csv").read_text(encoding="utf-8")
    assert "cg1" in written and "cg3" in written and "cg2" not in written


def test_run_heatmap_with_secondary_grouping(mock_job_with_samplesheet, no_run):
    job_id, _ = mock_job_with_samplesheet
    payload = {
        "grouping": {"primary": "Sample_Group", "secondary": "Sentrix_ID"},
        "filters": {"adj_p_value": "0.3"},
    }
    response = client.post(f"/api/v1/heatmap/{job_id}", json=payload)
    assert response.status_code == 202


def test_run_heatmap_no_matching_cpgs(mock_job_with_samplesheet, no_run):
    job_id, _ = mock_job_with_samplesheet
    response = client.post(
        f"/api/v1/heatmap/{job_id}",
        json={"grouping": {"primary": "Sample_Group"}, "filters": {"chr": "chrZ"}},
    )
    assert response.status_code == 400
    assert response.json()["type"] == ErrorTypes.HEATMAP_NO_CPGS.path


def test_run_heatmap_too_many_cpgs(mock_job_with_samplesheet, no_run, monkeypatch):
    job_id, _ = mock_job_with_samplesheet
    monkeypatch.setattr(heatmap_service, "MAX_CPGS", 1)
    response = client.post(
        f"/api/v1/heatmap/{job_id}",
        json={"grouping": {"primary": "Sample_Group"}, "filters": {}},
    )
    assert response.status_code == 400
    assert response.json()["type"] == ErrorTypes.HEATMAP_TOO_MANY_CPGS.path


def test_run_heatmap_invalid_primary_column(mock_job_with_samplesheet):
    job_id, _ = mock_job_with_samplesheet
    response = client.post(
        f"/api/v1/heatmap/{job_id}",
        json={"grouping": {"primary": "Spalte_Die_Nicht_Existiert"}},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path
    assert "available" in data


def test_run_heatmap_invalid_secondary_column(mock_job_with_samplesheet):
    job_id, _ = mock_job_with_samplesheet
    response = client.post(
        f"/api/v1/heatmap/{job_id}",
        json={"grouping": {"primary": "Sample_Group", "secondary": "Fantasie_Spalte"}},
    )
    assert response.status_code == 400
    assert response.json()["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path


def test_run_heatmap_primary_equals_secondary(mock_job_with_samplesheet):
    job_id, _ = mock_job_with_samplesheet
    response = client.post(
        f"/api/v1/heatmap/{job_id}",
        json={"grouping": {"primary": "Sample_Group", "secondary": "Sample_Group"}},
    )
    assert response.status_code == 400
    data = response.json()
    assert data["type"] == ErrorTypes.INVALID_GROUPING_COLUMN.path
    assert "identisch" in data["detail"]


def test_run_heatmap_job_not_found(mock_job):
    response = client.post(
        "/api/v1/heatmap/non-existent-job",
        json={"grouping": {"primary": "Sample_Group"}},
    )
    assert response.status_code == 404
    assert response.json()["type"] == ErrorTypes.JOB_NOT_FOUND.path


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
    """Sample sheet present, but no dmp_results.rds → FILE_NOT_FOUND."""
    job_id, job_dir = mock_job
    csv_content = (
        "[Data],,\n"
        "Sample_Name,Sample_Group,Sentrix_ID\n"
        "HeLa,Cellline,206891110001\n"
        "Jurkat,Cellline,206891110002\n"
        "Raji,Coriell,206891110001\n"
        "NA12873,Coriell,206891110002\n"
    )
    (job_dir / "SampleSheet.csv").write_text(csv_content, encoding="utf-8")

    response = client.post(
        f"/api/v1/heatmap/{job_id}", json={"grouping": {"primary": "Sample_Group"}}
    )
    assert response.status_code == 404
    assert response.json()["type"] == ErrorTypes.FILE_NOT_FOUND.path


# ── GET /{job_id} (PNG / PDF) ─────────────────────────────────────────────────

def test_get_heatmap_png_success(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "heatmap.png").write_bytes(b"\x89PNG\r\n\x1a\n")

    response = client.get(f"/api/v1/heatmap/{job_id}")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"\x89PNG\r\n\x1a\n"


def test_get_heatmap_pdf_success(mock_job):
    job_id, job_dir = mock_job
    (job_dir / "heatmap.pdf").write_bytes(b"%PDF-1.4")

    response = client.get(f"/api/v1/heatmap/{job_id}?format=pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"


def test_get_heatmap_png_not_yet_generated(mock_job):
    job_id, _ = mock_job
    response = client.get(f"/api/v1/heatmap/{job_id}")
    assert response.status_code == 404
    assert response.json()["type"] == ErrorTypes.PLOT_NOT_FOUND.path


def test_get_heatmap_invalid_format(mock_job):
    job_id, _ = mock_job
    response = client.get(f"/api/v1/heatmap/{job_id}?format=svg")
    assert response.status_code == 422  # rejected by the query pattern


def test_get_heatmap_png_job_not_found(mock_job):
    response = client.get("/api/v1/heatmap/non-existent-job")
    assert response.status_code == 404
    assert response.json()["type"] == ErrorTypes.JOB_NOT_FOUND.path
