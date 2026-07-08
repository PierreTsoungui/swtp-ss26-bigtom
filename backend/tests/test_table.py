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
                    f"1,"
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
                    f"1,"
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

        res = client.get("/api/v1/table/does-not-exist-xyz/dmp")

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
        # str() because an all-numeric CHR column is read back as int; the point
        # is that the UI filter "chr1" matched the bare "1" data.
        assert str(row["CHR"]) == "1"

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
        # str() because an all-numeric CHR column is read back as int; the point
        # is that the UI filter "chr1" matched the bare "1" data.
        assert str(row["CHR"]) == "1"
        assert row["POS"] >= 2000

# Realistic production layout: bare chromosome ids ("1", not "chr1") and
# lower-case CpG-island context ("island", not "Island"), exactly as the R
# pipeline and the customer specification produce them.
_DMP_CSV = (
    "ID,CHR,POS,GENE,FEATURE,CGI,ADJ_P,GROUP1_AVG,GROUP2_AVG,DELTA_BETA,LOG_FC,DMR_ID\n"
    "cg1,1,100,EPHX3,TSS1500,shore,0.01,0.9,0.1,0.8,3.0,DMR_421\n"    # hyper, in DMR_421
    "cg2,1,200,CMTM2,Body,island,0.02,0.2,0.8,-0.6,-2.0,DMR_4211\n"   # hypo, in DMR_4211
    "cg3,1,300,GENE3,IGR,opensea,0.03,0.7,0.3,0.4,1.0,-\n"            # hyper, no DMR
)


def _write_dmp(tmp_path):
    job_dir = tmp_path / "job-x"
    job_dir.mkdir()
    (job_dir / "dmp_results.csv").write_text(_DMP_CSV, encoding="utf-8")


def test_dmp_filter_by_dmr_id_is_exact(tmp_path):
    """DMR_421 must match only DMR_421 — never the substring sibling DMR_4211."""
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        _write_dmp(tmp_path)
        res = client.get("/api/v1/table/job-x/dmp", params={"filter_dmr_id": "DMR_421"})
        data = res.json()
        assert data["pagination"]["total_rows"] == 1
        assert data["data"][0]["ID"] == "cg1"


def test_dmp_filter_feature_and_cgi(tmp_path):
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        _write_dmp(tmp_path)
        res = client.get("/api/v1/table/job-x/dmp", params={"filter_feature": "TSS1500"})
        assert res.json()["pagination"]["total_rows"] == 1
        res = client.get("/api/v1/table/job-x/dmp", params={"filter_cgi": "Island"})
        rows = res.json()["data"]
        assert len(rows) == 1 and rows[0]["ID"] == "cg2"


def test_dmp_filter_delta_direction(tmp_path):
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        _write_dmp(tmp_path)
        hyper = client.get("/api/v1/table/job-x/dmp", params={"filter_delta_direction": "hyper"}).json()
        assert {r["ID"] for r in hyper["data"]} == {"cg1", "cg3"}
        hypo = client.get("/api/v1/table/job-x/dmp", params={"filter_delta_direction": "hypo"}).json()
        assert {r["ID"] for r in hypo["data"]} == {"cg2"}


# ── Regression: categorical filters must be tolerant to the UI's value format ──
# The table stores bare chromosome ids ("1") and lower-case CpG contexts
# ("island"), but the UI dropdown sends "chr1" and "Island". Before the fix the
# exact-equality comparison never matched, so these filters silently returned
# nothing on real data.

def test_dmp_filter_chr_matches_ui_prefixed_value(tmp_path):
    """UI sends 'chr1'; the table stores '1' — they must still match (and vice versa)."""
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        _write_dmp(tmp_path)
        prefixed = client.get("/api/v1/table/job-x/dmp", params={"filter_chr": "chr1"}).json()
        assert prefixed["pagination"]["total_rows"] == 3        # all three rows are chr "1"
        bare = client.get("/api/v1/table/job-x/dmp", params={"filter_chr": "1"}).json()
        assert bare["pagination"]["total_rows"] == 3            # bare form also works
        # A different chromosome must NOT match.
        other = client.get("/api/v1/table/job-x/dmp", params={"filter_chr": "chr2"}).json()
        assert other["pagination"]["total_rows"] == 0


def test_dmp_filter_cgi_is_case_insensitive(tmp_path):
    """UI sends 'Island'; the table stores 'island' — they must match."""
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        _write_dmp(tmp_path)
        upper = client.get("/api/v1/table/job-x/dmp", params={"filter_cgi": "Island"}).json()
        lower = client.get("/api/v1/table/job-x/dmp", params={"filter_cgi": "island"}).json()
        assert {r["ID"] for r in upper["data"]} == {"cg2"}
        assert {r["ID"] for r in lower["data"]} == {"cg2"}     # both casings agree


def _write_dmr(tmp_path):
    job_dir = tmp_path / "job-x"
    job_dir.mkdir()
    (job_dir / "dmr_results.csv").write_text(
        "ID,N_DMPS,CHR,START,STOP,WIDTH,P_VALUE,MEANDIFF\n"
        "DMR_1,5,1,150,250,100,0.001,0.3\n"
        "DMR_2,4,2,400,600,200,0.02,-0.2\n",
        encoding="utf-8",
    )


def test_dmr_filter_chr_matches_ui_prefixed_value(tmp_path):
    """The same chromosome tolerance must apply to the DMR table."""
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        _write_dmr(tmp_path)
        res = client.get("/api/v1/table/job-x/dmr", params={"filter_chr": "chr1"}).json()
        assert {r["ID"] for r in res["data"]} == {"DMR_1"}

def test_dmp_filter_gene_exact(tmp_path):
    """filter_gene must match only the exact gene symbol (SP6) — not USP6, CASP6, etc."""
    job_dir = tmp_path / "job-gene"
    job_dir.mkdir()
    csv = (
        "ID,CHR,POS,GENE,FEATURE,CGI,ADJ_P,GROUP1_AVG,GROUP2_AVG,DELTA_BETA\n"
        "cg1,1,100,SP6,feat,cgi,0.01,0.2,0.5,0.1\n"
        "cg2,1,200,USP6,feat,cgi,0.02,0.2,0.5,0.1\n"
        "cg3,1,300,CASP6,feat,cgi,0.03,0.2,0.5,0.1\n"
    )
    (job_dir / "dmp_results.csv").write_text(csv, encoding="utf-8")
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        res = client.get("/api/v1/table/job-gene/dmp", params={"filter_gene": "SP6"})
        assert res.status_code == 200
        assert res.json()["pagination"]["total_rows"] == 1
        assert res.json()["data"][0]["GENE"] == "SP6"