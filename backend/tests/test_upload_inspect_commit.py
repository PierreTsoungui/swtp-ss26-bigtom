"""Integration tests for the inspect → commit upload flow (UPL-01)."""
import io
import sys
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.core import config
from app.services import staging_manager, file_handler

client = TestClient(app)

SHEET = (
    b"[Data]\n"
    b"Sample_Name,Sample_Group,Sentrix_ID,Sentrix_Position\n"
    b"HeLa,Cellline,206891110001,R01C01\n"
    b"Jurkat,Cellline,206891110001,R03C01\n"
)
IDAT = b"\x00\x01\x02\x00\x00" * 50  # plausible binary (many null bytes)

# A sheet whose columns use names the Illumina alias table does NOT know, so the
# user must map the four roles explicitly (the customer's real-world case).
CUSTOM_SHEET = (
    b"Patient,Diagnosis,Chip,Well\n"
    b"P1,Tumor,206891110001,R01C01\n"
    b"P2,Normal,206891110001,R03C01\n"
)

# Maps the canonical sheet (SHEET) one-to-one; columns already carry the roles.
MAPPING = {
    "sentrix_id": "Sentrix_ID",
    "sentrix_position": "Sentrix_Position",
    "sample_group": "Sample_Group",
    "sample_name": "Sample_Name",
}


@pytest.fixture(autouse=True)
def isolated_dirs(tmp_path, monkeypatch):
    """Point staging + jobs at a temp area so tests never touch real data."""
    staging = tmp_path / "staging"
    jobs = tmp_path / "jobs"
    staging.mkdir()
    jobs.mkdir()
    monkeypatch.setattr(config, "STAGING_BASE_DIR", staging)
    monkeypatch.setattr(staging_manager, "STAGING_BASE_DIR", staging)
    monkeypatch.setattr(file_handler, "UPLOAD_BASE_DIR", jobs)
    yield


def _zip_bytes(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            zf.writestr(name, data)
    return buf.getvalue()


def _inspect_zip(entries: dict[str, bytes]):
    return client.post(
        "/api/v1/upload/inspect",
        files={"files": ("upload.zip", _zip_bytes(entries), "application/zip")},
    )


# ── Inspect ───────────────────────────────────────────────────────────────────

def test_inspect_zip_classifies_files():
    resp = _inspect_zip({
        "Demo/SampleSheet.csv": SHEET,
        "Demo/206891110001_R01C01_Grn.idat": IDAT,
        "Demo/206891110001_R01C01_Red.idat": IDAT,
        "Demo/readme.txt": b"hello",
    })
    assert resp.status_code == 201
    data = resp.json()

    assert data["source"] == "zip"
    assert len(data["sample_sheets"]) == 1
    sheet = data["sample_sheets"][0]
    assert sheet["recognized"]
    assert sheet["sample_count"] == 2
    assert "Sentrix_ID" in sheet["columns"]
    # Canonical column names are auto-recognized to pre-fill the role dropdowns.
    assert sheet["suggested_mapping"]["sentrix_id"] == "Sentrix_ID"
    assert sheet["suggested_mapping"]["sample_group"] == "Sample_Group"

    assert len(data["idats"]) == 1
    assert data["idats"][0]["complete"] is True
    assert any(o["name"] == "readme.txt" for o in data["other_files"])
    assert data["errors"] == []


def test_inspect_multiple_sheets_are_listed_without_error():
    resp = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "Other_SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    })
    assert resp.status_code == 201
    data = resp.json()
    # All candidates are offered; the user picks one via radio (no blocking error).
    assert len(data["sample_sheets"]) == 2
    assert data["errors"] == []


def test_inspect_individual_files():
    resp = client.post("/api/v1/upload/inspect", files=[
        ("files", ("SampleSheet.csv", SHEET, "text/csv")),
        ("files", ("206891110001_R01C01_Grn.idat", IDAT, "application/octet-stream")),
        ("files", ("206891110001_R01C01_Red.idat", IDAT, "application/octet-stream")),
    ])
    assert resp.status_code == 201
    data = resp.json()
    assert data["source"] == "files"
    assert len(data["idats"]) == 1 and data["idats"][0]["complete"]


def test_inspect_zip_mixed_with_individual_files():
    # A ZIP dropped alongside loose IDATs must still be extracted and merged.
    resp = client.post("/api/v1/upload/inspect", files=[
        ("files", ("data.zip", _zip_bytes({"SampleSheet.csv": SHEET}), "application/zip")),
        ("files", ("206891110001_R01C01_Grn.idat", IDAT, "application/octet-stream")),
        ("files", ("206891110001_R01C01_Red.idat", IDAT, "application/octet-stream")),
    ])
    assert resp.status_code == 201
    data = resp.json()
    assert data["source"] == "zip"
    assert len(data["sample_sheets"]) == 1          # from the ZIP
    assert data["idats"][0]["complete"] is True     # from the loose files
    assert data["errors"] == []


def test_inspect_no_supported_files_is_fatal():
    resp = _inspect_zip({"notes.txt": b"hi"})
    assert resp.status_code == 400
    assert resp.json()["type"] == "/errors/no-supported-files"


# ── Preview ───────────────────────────────────────────────────────────────────

def test_preview_returns_table():
    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    sid = data["session_id"]
    sheet_id = data["sample_sheets"][0]["id"]

    resp = client.get(f"/api/v1/upload/{sid}/preview", params={"sheet_id": sheet_id, "rows": 5})
    assert resp.status_code == 200
    prev = resp.json()
    assert "Sample_Name" in prev["columns"]
    assert prev["total_rows"] == 2
    assert prev["rows"][0][0] == "HeLa"


# ── Commit ────────────────────────────────────────────────────────────────────

def test_commit_starts_job(monkeypatch):
    # Don't actually run the R pipeline.
    async def _noop(*args, **kwargs):
        return None
    monkeypatch.setattr("app.services.upload_service.run_upload_pipeline", _noop)

    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    sid = data["session_id"]

    resp = client.post("/api/v1/upload/commit", json={
        "session_id": sid,
        "selected_sample_sheet_id": data["sample_sheets"][0]["id"],
        "selected_pair_ids": [data["idats"][0]["pair_id"]],
        "column_mapping": MAPPING,
        "filter_settings": {"det_p": {"enabled": True, "cutoff": 0.01}},
    })
    assert resp.status_code == 201
    body = resp.json()
    assert len(body["job_id"]) == 36

    # Staging removed, job dir populated with canonical sheet + both IDATs.
    assert not (config.STAGING_BASE_DIR / sid).exists()
    job_dir = file_handler.UPLOAD_BASE_DIR / body["job_id"]
    assert (job_dir / "SampleSheet.csv").read_text().startswith("[Data]")
    assert (job_dir / "206891110001_R01C01_Grn.idat").exists()
    assert (job_dir / "206891110001_R01C01_Red.idat").exists()

    # The chosen filter settings must actually reach the job (regression guard:
    # the frontend used to double-wrap them, so everything fell back to disabled).
    import json as _json
    settings = _json.loads((job_dir / "filter_settings.json").read_text())
    assert settings["det_p"]["enabled"] is True
    assert settings["det_p"]["cutoff"] == 0.01


def test_commit_unknown_session_404():
    resp = client.post("/api/v1/upload/commit", json={
        "session_id": "00000000-0000-0000-0000-000000000000",
        "selected_sample_sheet_id": "sheet-1",
        "selected_pair_ids": ["x"],
        "column_mapping": MAPPING,
    })
    assert resp.status_code == 404
    assert resp.json()["type"] == "/errors/session-not-found"


def test_commit_without_pairs_rejected():
    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    resp = client.post("/api/v1/upload/commit", json={
        "session_id": data["session_id"],
        "selected_sample_sheet_id": data["sample_sheets"][0]["id"],
        "selected_pair_ids": [],
        "column_mapping": MAPPING,
    })
    assert resp.status_code == 400
    assert resp.json()["type"] == "/errors/no-idat-files"


def test_commit_missing_column_mapping_is_422():
    # column_mapping is required: the UI only enables Start once all four roles
    # are chosen, and the backend enforces the same structurally.
    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    resp = client.post("/api/v1/upload/commit", json={
        "session_id": data["session_id"],
        "selected_sample_sheet_id": data["sample_sheets"][0]["id"],
        "selected_pair_ids": [data["idats"][0]["pair_id"]],
    })
    assert resp.status_code == 422


def test_commit_duplicate_role_columns_rejected():
    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    resp = client.post("/api/v1/upload/commit", json={
        "session_id": data["session_id"],
        "selected_sample_sheet_id": data["sample_sheets"][0]["id"],
        "selected_pair_ids": [data["idats"][0]["pair_id"]],
        "column_mapping": {**MAPPING, "sample_name": "Sentrix_ID"},  # reused column
    })
    assert resp.status_code == 422


def test_commit_mapping_to_missing_column_rejected():
    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    resp = client.post("/api/v1/upload/commit", json={
        "session_id": data["session_id"],
        "selected_sample_sheet_id": data["sample_sheets"][0]["id"],
        "selected_pair_ids": [data["idats"][0]["pair_id"]],
        "column_mapping": {**MAPPING, "sample_group": "Nonexistent_Column"},
    })
    assert resp.status_code == 400
    assert resp.json()["type"] == "/errors/invalid-column-mapping"


def test_commit_mapping_mismatched_with_idats_rejected():
    # Picking the wrong chip columns yields array ids that match no IDAT pair.
    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    resp = client.post("/api/v1/upload/commit", json={
        "session_id": data["session_id"],
        "selected_sample_sheet_id": data["sample_sheets"][0]["id"],
        "selected_pair_ids": [data["idats"][0]["pair_id"]],
        # Swap: Sample_Name/Sample_Group are not chip columns, so the built
        # array ids ("HeLa_Cellline") match no uploaded IDAT.
        "column_mapping": {
            "sentrix_id": "Sample_Name",
            "sentrix_position": "Sample_Group",
            "sample_group": "Sentrix_ID",
            "sample_name": "Sentrix_Position",
        },
    })
    assert resp.status_code == 400
    assert resp.json()["type"] == "/errors/invalid-column-mapping"


def test_commit_custom_sheet_columns_get_canonicalized(monkeypatch):
    # The headline feature: a sheet with unknown column names is normalized via
    # the explicit mapping so downstream sees the canonical roles.
    async def _noop(*args, **kwargs):
        return None
    monkeypatch.setattr("app.services.upload_service.run_upload_pipeline", _noop)

    data = _inspect_zip({
        "Custom.csv": CUSTOM_SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    sheet = data["sample_sheets"][0]
    assert sheet["columns"] == ["Patient", "Diagnosis", "Chip", "Well"]
    # Nothing auto-recognized for these names.
    assert sheet["suggested_mapping"]["sentrix_id"] is None

    resp = client.post("/api/v1/upload/commit", json={
        "session_id": data["session_id"],
        "selected_sample_sheet_id": sheet["id"],
        "selected_pair_ids": [data["idats"][0]["pair_id"]],
        "column_mapping": {
            "sentrix_id": "Chip",
            "sentrix_position": "Well",
            "sample_group": "Diagnosis",
            "sample_name": "Patient",
        },
    })
    assert resp.status_code == 201
    job_dir = file_handler.UPLOAD_BASE_DIR / resp.json()["job_id"]
    header = (job_dir / "SampleSheet.csv").read_text().splitlines()[1]
    for role in ("Sentrix_ID", "Sentrix_Position", "Sample_Group", "Sample_Name"):
        assert role in header


def test_discard_session():
    data = _inspect_zip({
        "SampleSheet.csv": SHEET,
        "206891110001_R01C01_Grn.idat": IDAT,
        "206891110001_R01C01_Red.idat": IDAT,
    }).json()
    sid = data["session_id"]
    assert (config.STAGING_BASE_DIR / sid).exists()

    resp = client.delete(f"/api/v1/upload/{sid}")
    assert resp.status_code == 204
    assert not (config.STAGING_BASE_DIR / sid).exists()
