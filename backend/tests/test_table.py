import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)


@pytest.fixture
def mock_job(tmp_path):
    """
    Erstellt eine minimale Mock-Jobstruktur mit realistischer output.csv.
    """

    job_id = "test-job-123"
    job_dir = tmp_path / job_id
    job_dir.mkdir()

    # CSV-Struktur entspricht dem produktiven Exportformat.
    # Erste Header-Spalte bleibt absichtlich leer.
    csv_path = job_dir / "output.csv"

    with open(csv_path, "w") as f:
        f.write(',206891110001_R01C01,206891110001_R03C01,206891110001_R07C01,206891110001_R08C01\n')

        # Erzeugt deterministische Testdaten für Pagination-Tests.
        for i in range(200):
            v1 = round((i * 0.1) % 1, 6)
            v2 = round((i * 0.2) % 1, 6)
            v3 = round((i * 0.3) % 1, 6)
            v4 = round((i * 0.4) % 1, 6)

            f.write(f'"cg{i:08d}_BC11",{v1},{v2},{v3},{v4}\n')

    # Lenkt den Service temporär auf das pytest-Dateisystem um.
    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        yield job_id, job_dir


def test_pagination_returns_correct_rows(mock_job):
    """Prüft, ob page_size korrekt angewendet wird."""

    job_id, _ = mock_job

    res = client.get(f"/api/v1/table/{job_id}?page=1&page_size=10")

    assert res.status_code == 200
    assert len(res.json()["data"]) == 10


def test_total_rows_correct(mock_job):
    """Validiert die Gesamtanzahl der CSV-Zeilen."""

    job_id, _ = mock_job

    res = client.get(f"/api/v1/table/{job_id}?page=1&page_size=100")

    assert res.json()["pagination"]["total_rows"] == 200


def test_cpg_id_in_response(mock_job):
    """
    Stellt sicher, dass die CpG-ID korrekt aus der ersten CSV-Spalte
    übernommen wird.
    """

    job_id, _ = mock_job

    res = client.get(f"/api/v1/table/{job_id}?page=1&page_size=10")

    first_row = res.json()["data"][0]

    assert "cpg_id" in first_row
    assert first_row["cpg_id"].startswith("cg")


def test_columns_returned(mock_job):
    """Prüft, ob Spaltenmetadaten vollständig zurückgegeben werden."""

    job_id, _ = mock_job

    res = client.get(f"/api/v1/table/{job_id}?page=1&page_size=10")

    col_names = [c["name"] for c in res.json()["columns"]]

    assert "cpg_id" in col_names
    assert "206891110001_R01C01" in col_names


def test_page_2_different_from_page_1(mock_job):
    """Validiert die tatsächliche Pagination über mehrere Seiten."""

    job_id, _ = mock_job

    res1 = client.get(f"/api/v1/table/{job_id}?page=1&page_size=10")
    res2 = client.get(f"/api/v1/table/{job_id}?page=2&page_size=10")

    assert res1.json()["data"][0]["cpg_id"] != res2.json()["data"][0]["cpg_id"]


def test_page_size_too_large(mock_job):
    """
    Große page_size-Werte sollen serverseitig begrenzt werden,
    um Speicher- und Transferkosten kontrollierbar zu halten.
    """

    job_id, _ = mock_job

    res = client.get(f"/api/v1/table/{job_id}?page_size=501")

    assert res.status_code == 400


def test_job_not_found(mock_job, tmp_path):
    """Nicht existierende Jobs müssen konsistent 404 liefern."""

    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        res = client.get("/api/v1/table/nicht-vorhanden-xyz")

        assert res.status_code == 404


def test_data_not_ready(mock_job, tmp_path):
    """
    Falls der Job existiert, aber noch keine output.csv erzeugt wurde,
    wird ein 'data not ready'-Zustand erwartet.
    """

    job_id = "job-ohne-csv"

    (tmp_path / job_id).mkdir()

    with patch("app.services.table_handler.JOBS_DIR", tmp_path):
        res = client.get(f"/api/v1/table/{job_id}")

        assert res.status_code == 409