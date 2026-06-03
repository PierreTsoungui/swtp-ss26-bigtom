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

    def create_csv(path):
        with open(path, "w") as f:
            f.write(",206891110001_R01C01,206891110001_R03C01,206891110001_R07C01,206891110001_R08C01\n")

            for i in range(200):
                v1 = round((i * 0.1) % 1, 6)
                v2 = round((i * 0.2) % 1, 6)
                v3 = round((i * 0.3) % 1, 6)
                v4 = round((i * 0.4) % 1, 6)

                f.write(f"cg{i:08d}_BC11,{v1},{v2},{v3},{v4}\n")

    create_csv(job_dir / "dmp_results.csv")
    create_csv(job_dir / "dmr_results.csv")

    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        yield job_id, job_dir


# HELPER

def call(job_id, table, page=1):
    return client.get(
        f"/api/v1/table/{job_id}",
        params={
            "table": table,
            "page": page
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


def test_cpg_id_in_response(mock_job):
    job_id, _ = mock_job

    res = call(job_id, "dmp")

    first_row = res.json()["data"][0]

    assert "cpg_id" in first_row
    assert first_row["cpg_id"].startswith("cg")


def test_columns_returned(mock_job):
    job_id, _ = mock_job

    res = call(job_id, "dmp")

    col_names = [c["key"] for c in res.json()["columns"]]

    assert "cpg_id" in col_names
    assert "206891110001_R01C01" in col_names


def test_page_2_different_from_page_1(mock_job):
    job_id, _ = mock_job

    res1 = call(job_id, "dmp", page=1)
    res2 = call(job_id, "dmp", page=2)

    assert res1.json()["data"] != res2.json()["data"]


def test_job_not_found(tmp_path):
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):

        res = client.get(
            "/api/v1/table/nicht-vorhanden-xyz",
            params={"table": "dmp"}
        )

        assert res.status_code == 404


def test_data_not_ready(tmp_path):

    job_id = "job-ohne-csv"
    (tmp_path / job_id).mkdir()

    with patch("app.services.table_handler.JOBS_DIR", tmp_path):

        res = client.get(
            f"/api/v1/table/{job_id}",
            params={"table": "dmp"}
        )

        assert res.status_code == 409