import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)

# --------------------------------------------------
# FIXTURE FÜR TESTDATEN (KORRIGIERT FÜR IHRE FILTER)
# --------------------------------------------------
@pytest.fixture
def mock_job(tmp_path):
    job_id = "test_job"
    job_dir = tmp_path / job_id
    job_dir.mkdir()

    # Create the DMP test file with the columns the backend expects.
    def create_dmp_csv(path):
        with open(path, "w") as f:
            # The backend filters on 'CHR' and 'ADJ_P'.
            f.write("cpg_id,206891110001_R01C01,score,CHR,ADJ_P\n")
            for i in range(100):
                adj_p = round(0.01 + (i * 0.001), 4)
                f.write(f"cg{i:08d}_BC11,{i * 0.1},{float(i)},chr1,{adj_p}\n")

    # Create the DMR test file with the columns the backend expects.
    def create_dmr_csv(path):
        with open(path, "w") as f:
            # The DMR backend filters on 'CHR' and 'P_VALUE'.
            f.write("cpg_id,206891110001_R01C01,score,CHR,P_VALUE\n")
            for i in range(100):
                p_val = round(0.01 + (i * 0.001), 4)
                f.write(f"cg{i:08d}_BC11,{i * 0.1},{float(i)},chr1,{p_val}\n")

    create_dmp_csv(job_dir / "dmp_results.csv")
    create_dmr_csv(job_dir / "dmr_results.csv")

    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        yield job_id, tmp_path


# --------------------------------------------------
# BASIS
# --------------------------------------------------

def test_export_returns_csv(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmp/export"
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")


def test_export_has_attachment_header(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmp/export"
    )

    assert "content-disposition" in response.headers
    assert "attachment" in response.headers["content-disposition"]


def test_export_contains_column_names(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmp/export"
    )

    first_line = response.text.splitlines()[0]
    assert "cpg_id" in first_line


# --------------------------------------------------
# DMP / DMR
# --------------------------------------------------

def test_export_dmp(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmp/export"
    )

    assert response.status_code == 200


def test_export_dmr(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmr/export"
    )

    assert response.status_code == 200


# --------------------------------------------------
# SORTIERUNG
# --------------------------------------------------

def test_export_sorting_desc(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmp/export"
        "?sort_by=score"
        "&sort_order=desc"
    )

    assert response.status_code == 200

    rows = response.text.splitlines()[1:]
    scores = []

    for row in rows:
        if row.strip():
            scores.append(float(row.split(",")[2]))

    assert scores == sorted(scores, reverse=True)


def test_export_invalid_sort_column(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmp/export"
        "?sort_by=does_not_exist"
        "&sort_order=asc"
    )

    assert response.status_code == 400


def test_export_invalid_sort_order(mock_job):
    job_id, _ = mock_job
    response = client.get(
        f"/api/v1/table/{job_id}/dmp/export"
        "?sort_by=score"
        "&sort_order=wrong"
    )

    assert response.status_code == 400


# --------------------------------------------------
# FILTER (KORRIGIERT NACH IHREMAP)
# --------------------------------------------------

def test_export_filter_chr(mock_job):
    job_id, tmp_path = mock_job
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        response = client.get(
            f"/api/v1/table/{job_id}/dmp/export"
            "?filter_chr=chr1"
        )

    assert response.status_code == 200

    rows = response.text.splitlines()[1:]
    for row in rows:
        if row.strip():
            assert "chr1" in row


def test_export_filter_pvalue(mock_job):
    job_id, tmp_path = mock_job
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        # DMP filters on 'filter_adj_p_value' (not 'filter_p_value').
        response = client.get(
            f"/api/v1/table/{job_id}/dmp/export"
            "?filter_adj_p_value=0.05"
        )

    assert response.status_code == 200
    assert len(response.text) > 0


# --------------------------------------------------
# NO PAGINATION
# --------------------------------------------------

def test_export_contains_more_rows_than_page(mock_job):
    job_id, tmp_path = mock_job
    
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        export_response = client.get(
            f"/api/v1/table/{job_id}/dmp/export"
        )

        table_response = client.get(
            f"/api/v1/table/{job_id}/dmp?page=1"
        )

    assert export_response.status_code == 200
    assert table_response.status_code == 200

    export_rows = len(export_response.text.splitlines()) - 1
    table_rows = len(table_response.json()["data"])

    assert export_rows > table_rows


# --------------------------------------------------
# ERROR CASES
# --------------------------------------------------

def test_export_unknown_job(tmp_path):
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        response = client.get(
            "/api/v1/table/not_existing/dmp/export"
        )

    assert response.status_code == 404


def test_export_unknown_table(mock_job):
    job_id, tmp_path = mock_job
    
    # Request an unknown table name; the job exists, so the table validation
    # (not the missing-job check) rejects it with a 400.
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        response = client.get(
            f"/api/v1/table/{job_id}/abc/export"
        )

    assert response.status_code == 400


# --------------------------------------------------
# FILENAME
# --------------------------------------------------

def test_export_filename(mock_job):
    job_id, tmp_path = mock_job
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        response = client.get(
            f"/api/v1/table/{job_id}/dmp/export"
        )

    header = response.headers["content-disposition"]
    assert ".csv" in header
    assert "dmp" in header
