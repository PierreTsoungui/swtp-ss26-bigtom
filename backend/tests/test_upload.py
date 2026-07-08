import json
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

client = TestClient(app)


# TEST DATA PATHS: adjust this path to point at your test data.

TEST_DATA_DIR     = Path(__file__).resolve().parents[1].parent / "jobs" / "07b7fa29-8a9d-418d-bc16-8308a2b387fd"
SAMPLE_SHEET_PATH = Path(__file__).resolve().parents[1].parent / "jobs" / "07b7fa29-8a9d-418d-bc16-8308a2b387fd" / "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"

# Create minimal test data if missing so tests are self-contained
if not TEST_DATA_DIR.exists():
    TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
    basenames = ["sample_1", "sample_2"]
    for b in basenames:
        for channel in ("Grn", "Red"):
            fname = TEST_DATA_DIR / f"{b}_{channel}.idat"
            with open(fname, "wb") as f:
                f.write(b"\x00\x01\x02\x00\x00" * 50)
    SAMPLE_SHEET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SAMPLE_SHEET_PATH, "w", encoding="utf-8") as f:
        f.write("Sample_Name,Sentrix_ID,Sentrix_Position\n")
        for i, b in enumerate(["sample_1", "sample_2"], 1):
            f.write(f"{b},20689111000{i},R01C01\n")


# SHARED HELPERS


def get_idat_files() -> list:
    """Read all IDAT files from the test data directory."""
    files = []
    if TEST_DATA_DIR.exists():
        # Use rglob to find IDATs in all subdirectories recursively
        for file_path in sorted(TEST_DATA_DIR.rglob("*.idat")):
            if file_path.is_file():
                files.append((
                    "idat_files",
                    (file_path.name, file_path.read_bytes(), "application/octet-stream"),
                ))
    return files


def get_sample_sheet() -> tuple:
    """Read the sample sheet."""
    if SAMPLE_SHEET_PATH.exists():
        return (
            "sample_sheet",
            (SAMPLE_SHEET_PATH.name, SAMPLE_SHEET_PATH.read_bytes(), "text/csv"),
        )
    return None


def valid_files() -> list:
    """Return IDAT + sample sheet. Fail if files are missing."""
    idats  = get_idat_files()
    sheet  = get_sample_sheet()
    if not idats or not sheet:
        pytest.fail(
            f"Test data not found!\n"
            f"IDATs in:     {TEST_DATA_DIR}\n"
            f"Sample Sheet: {SAMPLE_SHEET_PATH}"
        )
    return idats + [sheet]


def wrap(settings: dict) -> str:
    """Wrap dict in the API contract: {'filter_settings': {...}}."""
    return json.dumps({"filter_settings": settings})



# TEST CLASS: TestUpload


class TestUpload:
    """Tests for the upload endpoint."""

    # ── Successful Uploads ──────────────────────────────────────────────────

    def test_upload_success(self):
        """Successful upload without filter_settings → defaults."""
        response = client.post("/api/v1/upload", files=valid_files())

        assert response.status_code == 201
        data = response.json()
        assert "job_id" in data
        # FIX: New architecture returns 'waiting' instead of 'queued'
        assert data["status"] == "waiting"
        assert len(data["job_id"]) == 36
        assert "filter_settings" in data
        fs = data["filter_settings"]
        assert fs["det_p"]["enabled"] is False
        assert fs["det_p"]["cutoff"] == 0.01

    def test_upload_success_with_valid_filter_settings(self):
        """Successful upload with complete, valid filter_settings."""
        settings = wrap({
            "det_p":          {"enabled": True,  "cutoff": 0.01},
            "bead_count":     {"enabled": True,  "bead_cutoff": 0.05},
            "non_cpg":        {"enabled": True},
            "snp":            {"enabled": True,  "maf_cutoff": 0.05},
            "multi_hit":      {"enabled": True},
            "xy_chromosomes": {"enabled": False},
            "sample_quality": {
                "enabled": True,
                "detection_p_cutoff": 0.01,
                "sample_failure_rate": 0.10,
                "remove_failed_samples": True,
                "enable_pca_outlier_detection": True
            }
        })
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        fs = response.json()["filter_settings"]
        assert fs["det_p"]["enabled"] is True
        assert fs["xy_chromosomes"]["enabled"] is False
        assert fs["sample_quality"]["remove_failed_samples"] is True

    def test_upload_success_filter_all_disabled(self):
        """All filters disabled → valid configuration."""
        settings = wrap({
            "det_p":          {"enabled": False},
            "bead_count":     {"enabled": False},
            "non_cpg":        {"enabled": False},
            "snp":            {"enabled": False},
            "multi_hit":      {"enabled": False},
            "xy_chromosomes": {"enabled": False},
            "sample_quality": {"enabled": False}
        })
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        fs = response.json()["filter_settings"]
        assert fs["det_p"]["enabled"] is False
        assert fs["sample_quality"]["enabled"] is False

    def test_upload_success_partial_filter_settings(self):
        """Only individual filters provided → missing fields get defaults."""
        settings = wrap({"det_p": {"enabled": True}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        fs = response.json()["filter_settings"]
        assert fs["det_p"]["enabled"] is True
        assert fs["bead_count"]["enabled"] is False
        assert fs["bead_count"]["bead_cutoff"] == 0.05
        assert fs["sample_quality"]["sample_failure_rate"] == 0.10

    def test_upload_success_xy_chromosomes_enabled(self):
        """XY filter explicitly enabled."""
        settings = wrap({"xy_chromosomes": {"enabled": True}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["xy_chromosomes"]["enabled"] is True

    def test_upload_success_no_filter_settings_field(self):
        """filter_settings omitted → defaults."""
        response = client.post("/api/v1/upload", files=valid_files())
        assert response.status_code == 201
        fs = response.json()["filter_settings"]
        assert fs["det_p"]["enabled"] is False
        assert fs["snp"]["maf_cutoff"] == 0.05

    def test_upload_success_empty_filter_settings_string(self):
        """filter_settings as empty string → defaults."""
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": ""},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["enabled"] is False

    # ── filter_settings: Out-of-Range Values ──────────────────────────────

    def test_upload_cutoff_out_of_range_gets_default(self):
        """cutoff=0.5 outside valid range → default 0.01."""
        settings = wrap({"det_p": {"enabled": True, "cutoff": 0.5}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["cutoff"] == 0.01

    def test_upload_maf_cutoff_out_of_range_gets_default(self):
        """maf_cutoff=1.5 outside [0.01, 0.1] → default 0.05."""
        settings = wrap({"snp": {"enabled": True, "maf_cutoff": 1.5}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["snp"]["maf_cutoff"] == 0.05

    def test_upload_maf_cutoff_zero_triggers_default(self):
        """maf_cutoff=0.0 → default 0.05."""
        settings = wrap({"snp": {"enabled": True, "maf_cutoff": 0.0}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["snp"]["maf_cutoff"] == 0.05

    def test_upload_bead_cutoff_out_of_range_gets_default(self):
        """bead_cutoff=2.5 → default 0.05."""
        settings = wrap({"bead_count": {"enabled": True, "bead_cutoff": 2.5}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["bead_count"]["bead_cutoff"] == 0.05

    def test_upload_sample_failure_rate_out_of_range_gets_default(self):
        """sample_failure_rate=5.0 → default 0.10."""
        settings = wrap({"sample_quality": {"enabled": True, "sample_failure_rate": 5.0}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["sample_quality"]["sample_failure_rate"] == 0.10

    def test_upload_cutoff_as_string_gets_coerced(self):
        """cutoff as string '0.01' → coerced to float."""
        settings = wrap({"det_p": {"enabled": True, "cutoff": "0.01"}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["cutoff"] == 0.01

    # ── filter_settings: Malformed Structure ──────────────────────────────

    def test_upload_filter_settings_not_wrapped(self):
        """filter_settings without {'filter_settings': {...}} → 400."""
        raw = json.dumps({"det_p": {"enabled": False}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": raw},
        )
        assert response.status_code == 400
        body = response.json()
        assert "filter_settings" in str(body).lower()

    def test_upload_filter_settings_invalid_json(self):
        """Malformed JSON → 400."""
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": "{det_p: true"},
        )
        assert response.status_code == 400

    def test_upload_filter_settings_is_array(self):
        """filter_settings as JSON array → 400/422."""
        raw = json.dumps({"filter_settings": [{"det_p": True}]})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": raw},
        )
        assert response.status_code in (400, 422)

    def test_upload_filter_settings_wrapper_is_null(self):
        """{'filter_settings': null} → 400/422."""
        raw = json.dumps({"filter_settings": None})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": raw},
        )
        assert response.status_code in (400, 422)

    def test_upload_filter_settings_unknown_keys_ignored(self):
        """Unknown keys are ignored by Pydantic."""
        settings = wrap({
            "det_p": {"enabled": True, "cutoff": 0.01},
            "unknown_filter": {"enabled": True},
        })
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201

    def test_upload_filter_settings_enabled_as_string_true(self):
        """enabled='true' → coerced to bool True."""
        settings = wrap({"det_p": {"enabled": "true", "cutoff": 0.01}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["enabled"] is True

    def test_upload_filter_settings_enabled_as_string_false(self):
        """enabled='false' → coerced to bool False."""
        settings = wrap({"det_p": {"enabled": "false"}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["enabled"] is False

    def test_upload_filter_settings_enabled_as_int_zero(self):
        """enabled=0 → coerced to bool False."""
        settings = wrap({"non_cpg": {"enabled": 0}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["non_cpg"]["enabled"] is False

    # ── IDAT Errors ──────────────────────────────────────────────────────────

    def test_upload_no_idat_files(self):
        """No IDAT files → 422."""
        sheet = get_sample_sheet()
        if not sheet:
            pytest.fail("Sample sheet not found")
        response = client.post("/api/v1/upload", files=[sheet])
        assert response.status_code == 422

    def test_upload_no_sample_sheet(self):
        """No sample sheet → 422."""
        idats = get_idat_files()
        if not idats:
            pytest.fail("IDAT files not found")
        response = client.post("/api/v1/upload", files=idats)
        assert response.status_code in (400, 415, 422)

    def test_upload_invalid_idat_count(self):
        """Odd number of IDATs → 400."""
        idats = get_idat_files()
        sheet = get_sample_sheet()
        if not idats or not sheet:
            pytest.fail("Test data not found")
        if len(idats) > 1:
            idats = idats[1:]
        response = client.post("/api/v1/upload", files=idats + [sheet])
        assert response.status_code == 400
        body = str(response.json()).lower()
        assert "gerade" in body or "paarweise" in body or "pair" in body

    def test_upload_invalid_idat_extension(self):
        """Invalid file extension → 400."""
        idats = get_idat_files()
        sheet = get_sample_sheet()
        if not idats or not sheet:
            pytest.fail("Test data not found")
        fake = ("idat_files", ("fake.txt", b"fake", "application/octet-stream"))
        idats[0] = fake
        response = client.post("/api/v1/upload", files=idats + [sheet])
        assert response.status_code == 400
        body = str(response.json())
        assert ".idat" in body or "Format" in body

    def test_upload_invalid_sample_sheet_extension(self):
        """Invalid sample sheet extension → 415."""
        idats = get_idat_files()
        if not idats:
            pytest.fail("IDAT files not found")
        fake_sheet = ("sample_sheet", ("samples.pdf", b"fake", "application/pdf"))
        response = client.post("/api/v1/upload", files=idats + [fake_sheet])
        assert response.status_code == 415
        body = str(response.json())
        assert "Format" in body or ".xlsx" in body or ".csv" in body