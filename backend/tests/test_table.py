import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)


@pytest.fixture
def mock_job(tmp_path):
    job_id = "test-job-123"
    job_dir = tmp_path / job_id
    job_dir.mkdir()

    def create_dmp_csv(path):
        with open(path, "w") as f:
            f.write(
                "ID,CHR,POS,GENE,FEATURE,CGI,ADJ_P,GROUP1_AVG,GROUP2_AVG,DELTA_BETA\n"
            )
            for i in range(200):
                f.write(
                    f"cg{i:08d}_BC11,"
                    f"chr1,"
                    f"{i*10},"
                    f"GENE{i},"
                    f"feat,"
                    f"cgi,"
                    f"{0.01},"
                    f"{0.2},"
                    f"{0.5},"
                    f"{0.1}\n"
                )

    def create_dmr_csv(path):
        with open(path, "w") as f:
            f.write(
                "ID,CHR,START,STOP,WIDTH,P_VALUE,MEANDIFF,N_DMPS\n"
            )
            for i in range(200):
                f.write(
                    f"DMR_{i},"
                    f"chr1,"
                    f"{i*10},"
                    f"{i*10+50},"
                    f"{50},"
                    f"{0.01},"
                    f"{0.3},"
                    f"{5}\n"
                )

    create_dmp_csv(job_dir / "dmp_results.csv")
    create_dmr_csv(job_dir / "dmr_results.csv")

    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        yield job_id, job_dir


# HELPER
def call(
    job_id,
    table,
    page=1,
    **params
):
    return client.get(
        f"/api/v1/table/{job_id}/{table}",
        params={
            "page": page,
            **params,
        }
    )

def test_pagination_returns_correct_rows(mock_job):
    job_id, _ = mock_job

    res = call(job_id, "dmp")

    assert res.status_code == 200
    assert len(res.json()["data"]) == 75


def test_total_rows_correct(mock_job):
    job_id, _ = mock_job

    res = call(job_id, "dmp")

    assert res.json()["pagination"]["total_rows"] == 200


def  test_id_in_response(mock_job):
    job_id, _ = mock_job

    res = call(job_id, "dmp")

    first_row = res.json()["data"][0]

    assert "ID" in first_row
    assert first_row["ID"].startswith("cg")


def test_columns_returned(mock_job):
    job_id, _ = mock_job

    res = call(job_id, "dmp")

    col_names = [c["key"] for c in res.json()["columns"]]

    assert "ID" in col_names
    assert "CHR" in col_names


def test_page_2_different_from_page_1(mock_job):
    job_id, _ = mock_job

    res1 = call(job_id, "dmp", page=1)
    res2 = call(job_id, "dmp", page=2)

    assert res1.json()["data"] != res2.json()["data"]


def test_job_not_found(tmp_path):
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):

        res = client.get(
            "/api/v1/table/nicht-vorhanden-xyz/dmp",
          
        )

        assert res.status_code == 404


def test_data_not_ready(tmp_path):

    job_id = "job-ohne-csv"
    (tmp_path / job_id).mkdir()

    with patch("app.services.table_handler.JOBS_DIR", tmp_path):

        res = client.get(
            f"/api/v1/table/{job_id}/dmp",
           
        )

        assert res.status_code == 409
def test_filter_chr(mock_job):
    job_id, _ = mock_job

    res = call(
        job_id,
        "dmp",
        filter_chr="chr1"
    )

    assert res.status_code == 200

    for row in res.json()["data"]:
        assert row["CHR"] == "chr1"

def test_filter_start(mock_job):
    job_id, _ = mock_job

    res = call(
        job_id,
        "dmp",
        filter_start="2000"
    )

    assert res.status_code == 200

    for row in res.json()["data"]:
        assert row["POS"] >= 2000

def test_unknown_filter_returns_400(mock_job):
    job_id, _ = mock_job

    res = call(
        job_id,
        "dmp",
        filter_banana="123"
    )

    assert res.status_code == 400
def test_invalid_numeric_filter_returns_400(mock_job):
    job_id, _ = mock_job

    res = call(
        job_id,
        "dmp",
        filter_start="abc"
    )

    assert res.status_code == 400
def test_invalid_sort_column_returns_400(mock_job):
    job_id, _ = mock_job

    res = call(
        job_id,
        "dmp",
        sort_by="BANANA",
        sort_order="asc"
    )

    assert res.status_code == 400
def test_filter_chr_and_start(mock_job):
    job_id, _ = mock_job

    res = call(
        job_id,
        "dmp",
        filter_chr="chr1",
        filter_start="2000"
    )

    assert res.status_code == 200

    for row in res.json()["data"]:
        assert row["CHR"] == "chr1"
        assert row["POS"] >= 2000