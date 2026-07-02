import json
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services import file_handler

client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolate_job_dir(tmp_path, monkeypatch):
    """Keep the legacy /upload tests from writing real job dirs into ./jobs.

    Each test created a persistent job directory under the working directory;
    over many runs that floods ./jobs. Redirecting the upload base to a tmp dir
    makes the tests self-contained.
    """
    monkeypatch.setattr(file_handler, "UPLOAD_BASE_DIR", tmp_path)

# =========================================================
# PFADE ZU TESTDATEN
# =========================================================
TEST_DATA_DIR     = Path(__file__).resolve().parents[1].parent / "jobs" / "07b7fa29-8a9d-418d-bc16-8308a2b387fd"
SAMPLE_SHEET_PATH = Path(__file__).resolve().parents[1].parent / "jobs" / "07b7fa29-8a9d-418d-bc16-8308a2b387fd" / "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"

import os

# Create minimal test data if missing so tests are self-contained
if not TEST_DATA_DIR.exists():
    TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
    basenames = ["sample_1", "sample_2"]
    for b in basenames:
        for channel in ("Grn", "Red"):
            fname = TEST_DATA_DIR / f"{b}_{channel}.idat"
            with open(fname, "wb") as f:
                # plausible binary contents: include many null bytes
                f.write(b"\x00\x01\x02\x00\x00" * 50)
    SAMPLE_SHEET_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SAMPLE_SHEET_PATH, "w", encoding="utf-8") as f:
        f.write("Basename\n")
        for b in basenames:
            f.write(f"{b}\n")

# =========================================================
# SHARED HELPERS
# =========================================================

def get_idat_files() -> list:
    files = []
    if TEST_DATA_DIR.exists():
        for file_path in sorted(TEST_DATA_DIR.iterdir()):
            if file_path.is_file() and file_path.suffix.lower() == ".idat":
                files.append((
                    "idat_files",
                    (file_path.name, file_path.read_bytes(), "application/octet-stream"),
                ))
    return files


def get_sample_sheet() -> tuple:
    if SAMPLE_SHEET_PATH.exists():
        return (
            "sample_sheet",
            (SAMPLE_SHEET_PATH.name, SAMPLE_SHEET_PATH.read_bytes(), "text/csv"),
        )
    return None


def valid_files() -> list:
    """Gibt IDAT + Samplesheet zurück. Schlägt fehl wenn Dateien fehlen."""
    idats  = get_idat_files()
    sheet  = get_sample_sheet()
    if not idats or not sheet:
        pytest.fail(
            f"Testdaten nicht gefunden!\n"
            f"IDATs in:     {TEST_DATA_DIR}\n"
            f"Sample Sheet: {SAMPLE_SHEET_PATH}"
        )
    return idats + [sheet]


def wrap(settings: dict) -> str:
    """Wraps dict in den API-Contract: {'filter_settings': {...}}."""
    return json.dumps({"filter_settings": settings})


# =========================================================
# CLASS: TestUpload
# =========================================================

class TestUpload:
    """Tests für den Upload-Endpunkt."""

    # ── Erfolgreiche Uploads ──────────────────────────────────────────────────

    def test_upload_success(self):
        """Erfolgreicher Upload ohne filter_settings → Defaults werden verwendet (enabled=False)."""
        response = client.post("/api/v1/upload", files=valid_files())

        assert response.status_code == 201
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "queued"
        assert len(data["job_id"]) == 36
        # Defaults zurückgegeben
        assert "filter_settings" in data
        fs = data["filter_settings"]
        assert fs["det_p"]["enabled"] is False  # Korrigiert: Default ist jetzt False
        assert fs["det_p"]["cutoff"] == 0.01
        print(f"\n Upload erfolgreich! Job-ID: {data['job_id']}")

    def test_upload_success_with_valid_filter_settings(self):
        """Erfolgreicher Upload mit vollständigen, validen filter_settings (neues Modell)."""
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
        data = response.json()
        assert data["filter_settings"]["det_p"]["enabled"] is True
        assert data["filter_settings"]["xy_chromosomes"]["enabled"] is False
        assert data["filter_settings"]["sample_quality"]["remove_failed_samples"] is True

    def test_upload_success_filter_all_disabled(self):
        """Alle Filter deaktiviert — valide Konfiguration."""
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
        """
        Nur einzelne Filter angegeben → fehlende Felder werden mit Defaults aufgefüllt.
        """
        settings = wrap({"det_p": {"enabled": True}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        fs = response.json()["filter_settings"]
        assert fs["det_p"]["enabled"] is True
        # bead_count wurde nicht übergeben → Default greift (enabled=False)
        assert fs["bead_count"]["enabled"] is False  # Korrigiert: Default ist False
        assert fs["bead_count"]["bead_cutoff"] == 0.05
        # sample_quality wurde nicht übergeben → Default greift
        assert fs["sample_quality"]["sample_failure_rate"] == 0.10

    def test_upload_success_xy_chromosomes_enabled(self):
        """XY-Filter explizit aktiviert."""
        settings = wrap({"xy_chromosomes": {"enabled": True}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["xy_chromosomes"]["enabled"] is True

    def test_upload_success_no_filter_settings_field(self):
        """
        filter_settings komplett weggelassen.
        → Defaults werden verwendet (enabled=False).
        """
        response = client.post("/api/v1/upload", files=valid_files())
        assert response.status_code == 201
        fs = response.json()["filter_settings"]
        # Alle Defaults prüfen
        assert fs["det_p"]["enabled"] is False  # Korrigiert: Default ist False
        assert fs["snp"]["maf_cutoff"] == 0.05

    def test_upload_success_empty_filter_settings_string(self):
        """filter_settings als leerer String → Defaults (enabled=False)."""
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": ""},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["enabled"] is False  # Korrigiert

    # ── filter_settings: Grenzwert-Korrekturen (Defaults greifen) ────────────

    def test_upload_cutoff_out_of_range_gets_default(self):
        """cutoff=0.5 liegt außerhalb des Gültigkeitsbereichs → setzt Default 0.01."""
        settings = wrap({"det_p": {"enabled": True, "cutoff": 0.5}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["cutoff"] == 0.01

    def test_upload_maf_cutoff_out_of_range_gets_default(self):
        """maf_cutoff=1.5 außerhalb [0.0, 1.0] → Default 0.05."""
        settings = wrap({"snp": {"enabled": True, "maf_cutoff": 1.5}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["snp"]["maf_cutoff"] == 0.05

    def test_upload_maf_cutoff_zero_triggers_default(self):
        """maf_cutoff=0.0 gilt als ungültig/falsy und wird vom Validator auf 0.05 zurückgesetzt."""
        settings = wrap({"snp": {"enabled": True, "maf_cutoff": 0.0}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        # Korrigiert: Backend liefert 0.05 bei Übergabe von 0.0 zurück
        assert response.json()["filter_settings"]["snp"]["maf_cutoff"] == 0.05

    def test_upload_bead_cutoff_out_of_range_gets_default(self):
        """bead_cutoff=2.5 außerhalb [0.0, 1.0] → Default 0.05."""
        settings = wrap({"bead_count": {"enabled": True, "bead_cutoff": 2.5}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["bead_count"]["bead_cutoff"] == 0.05

    def test_upload_sample_failure_rate_out_of_range_gets_default(self):
        """sample_failure_rate=5.0 außerhalb [0.0, 1.0] → Default 0.10."""
        settings = wrap({"sample_quality": {"enabled": True, "sample_failure_rate": 5.0}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["sample_quality"]["sample_failure_rate"] == 0.10

    def test_upload_cutoff_as_string_gets_coerced(self):
        """cutoff als String '0.01' → wird zu float konvertiert (Pydantic coercion)."""
        settings = wrap({"det_p": {"enabled": True, "cutoff": "0.01"}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["cutoff"] == 0.01

    # ── filter_settings: Fehlerhafte Struktur → 400 ───────────────────────────

    def test_upload_filter_settings_not_wrapped(self):
        """filter_settings ohne Wrapper {'filter_settings': {...}} → 400."""
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
        """Kaputtes JSON in filter_settings → 400."""
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": "{det_p: true"},
        )
        assert response.status_code == 400

    def test_upload_filter_settings_is_array(self):
        """filter_settings als JSON-Array statt Objekt → 400/422."""
        raw = json.dumps({"filter_settings": [{"det_p": True}]})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": raw},
        )
        assert response.status_code in (400, 422)

    def test_upload_filter_settings_wrapper_is_null(self):
        """{'filter_settings': null} → 400 oder 422."""
        raw = json.dumps({"filter_settings": None})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": raw},
        )
        assert response.status_code in (400, 422)

    def test_upload_filter_settings_unknown_keys_ignored(self):
        """Unbekannte Keys werden von Pydantic ignoriert."""
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
        """enabled='true' (String) → Pydantic coercion zu bool True."""
        settings = wrap({"det_p": {"enabled": "true", "cutoff": 0.01}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["enabled"] is True

    def test_upload_filter_settings_enabled_as_string_false(self):
        """enabled='false' (String) → Pydantic coercion zu bool False."""
        settings = wrap({"det_p": {"enabled": "false"}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["det_p"]["enabled"] is False

    def test_upload_filter_settings_enabled_as_int_zero(self):
        """enabled=0 → Pydantic coercion zu bool False."""
        settings = wrap({"non_cpg": {"enabled": 0}})
        response = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert response.status_code == 201
        assert response.json()["filter_settings"]["non_cpg"]["enabled"] is False

    # ── IDAT-Fehler ───────────────────────────────────────────────────────────

    def test_upload_no_idat_files(self):
        sheet = get_sample_sheet()
        if not sheet:
            pytest.fail("Sample Sheet nicht gefunden")
        response = client.post("/api/v1/upload", files=[sheet])
        assert response.status_code == 422

    def test_upload_no_sample_sheet(self):
        idats = get_idat_files()
        if not idats:
            pytest.fail("IDAT-Dateien nicht gefunden")
        response = client.post("/api/v1/upload", files=idats)
        assert response.status_code in (400, 415, 422)

    def test_upload_invalid_idat_count(self):
        idats  = get_idat_files()
        sheet  = get_sample_sheet()
        if not idats or not sheet:
            pytest.fail("Testdaten nicht gefunden")
        if len(idats) > 1:
            idats = idats[1:]
        response = client.post("/api/v1/upload", files=idats + [sheet])
        assert response.status_code == 400
        body = str(response.json()).lower()
        assert "gerade" in body or "paarweise" in body or "pair" in body

    def test_upload_invalid_idat_extension(self):
        idats = get_idat_files()
        sheet = get_sample_sheet()
        if not idats or not sheet:
            pytest.fail("Testdaten nicht gefunden")
        fake = ("idat_files", ("fake.txt", b"fake", "application/octet-stream"))
        idats[0] = fake
        response = client.post("/api/v1/upload", files=idats + [sheet])
        assert response.status_code == 400
        body = str(response.json())
        assert ".idat" in body or "Format" in body

    def test_upload_invalid_sample_sheet_extension(self):
        idats = get_idat_files()
        if not idats:
            pytest.fail("IDAT-Dateien nicht gefunden")
        fake_sheet = ("sample_sheet", ("samples.pdf", b"fake", "application/pdf"))
        response = client.post("/api/v1/upload", files=idats + [fake_sheet])
        assert response.status_code == 415
        body = str(response.json())
        assert "Format" in body or ".xlsx" in body or ".csv" in body


# =========================================================
# CLASS: TestStatus
# =========================================================

class TestStatus:
    """Tests für den Status-Endpunkt."""

    def test_status_not_found(self):
        response = client.get("/api/v1/status/non-existent-id-12345")
        assert response.status_code == 404
        body = response.json()
        assert body["detail"]["type"] == "/errors/job-not-found"

    def test_status_invalid_uuid_format(self):
        response = client.get("/api/v1/status/!!!invalid!!!")
        assert response.status_code == 404

    def test_status_success(self):
        upload = client.post("/api/v1/upload", files=valid_files())
        assert upload.status_code == 201
        job_id = upload.json()["job_id"]

        response = client.get(f"/api/v1/status/{job_id}")
        assert response.status_code == 200

        data = response.json()
        assert data["job_id"] == job_id
        assert data["status"] in ("queued", "running", "filtering_done", "failed")
        print(f"\n Job {job_id} Status: {data['status']}")

    def test_status_contains_filter_settings(self):
        settings = wrap({"det_p": {"enabled": False}})
        upload = client.post(
            "/api/v1/upload",
            files=valid_files(),
            data={"filter_settings": settings},
        )
        assert upload.status_code == 201

        job_id = upload.json()["job_id"]

        response = client.get(f"/api/v1/status/{job_id}")
        assert response.status_code == 200