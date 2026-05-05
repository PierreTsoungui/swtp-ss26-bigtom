import io
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


# ----------------------------
# 1. SUCCESS CASE
# ----------------------------
def test_upload_success():
    idat_file = (
        "sample1.idat",
        io.BytesIO(b"fake idat content"),
        "application/octet-stream"
    )

    csv_file = (
        "samplesheet.csv",
        io.BytesIO(b"col1,col2\n1,2"),
        "text/csv"
    )

    response = client.post(
        "/upload",
        files={
            "idat_files": idat_file,
            "sample_sheet": csv_file
        }
    )

    assert response.status_code == 201

    data = response.json()
    assert "job_id" in data
    assert data["status"] == "queued"


# ----------------------------
# 2. INVALID FILE CASE
# ----------------------------
def test_upload_invalid_file():
    bad_file = (
        "virus.exe",
        io.BytesIO(b"malicious content"),
        "application/octet-stream"
    )

    csv_file = (
        "samplesheet.csv",
        io.BytesIO(b"col1,col2\n1,2"),
        "text/csv"
    )

    response = client.post(
        "/upload",
        files={
            "idat_files": bad_file,
            "sample_sheet": csv_file
        }
    )

    assert response.status_code == 400