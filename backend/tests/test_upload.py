import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys

# Damit wir die app importieren können
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

client = TestClient(app)

# =========================================================
# PFADE ZU ECHTEN TESTDATEN kann angepasst werden, um echte Kundendaten zu verwenden
# =========================================================
TEST_DATA_DIR = Path(__file__).parent / "data" / "206891110004"
SAMPLE_SHEET_PATH = Path(__file__).parent / "data" / "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"


class TestUpload:
    """Tests für den Upload-Endpunkt mit echten Kundendaten"""
    
    def get_files(self) -> list:
        """Liest alle echten Dateien aus dem Testdaten-Ordner"""
        files = []
        if TEST_DATA_DIR.exists():
            for file_path in TEST_DATA_DIR.iterdir():
                if file_path.is_file():
                    with open(file_path, "rb") as f:
                        content = f.read()
                    files.append((
                        "idat_files", 
                        (file_path.name, content, "application/octet-stream")
                    ))
        return files
    
    def get_sample_sheet(self) -> tuple:
        """Liest das echte Sample Sheet"""
        if SAMPLE_SHEET_PATH.exists():
            with open(SAMPLE_SHEET_PATH, "rb") as f:
                content = f.read()
            return ("sample_sheet", (SAMPLE_SHEET_PATH.name, content, "text/csv"))
        return None
    
    # =========================================================
    # ERFOLGREICHE TESTS
    # =========================================================
    
    def test_upload_success(self):
        """Test: Erfolgreicher Upload mit echten Kundendaten"""
        
        idat_files = self.get_files()
        sample_sheet = self.get_sample_sheet()
        
        if not idat_files or not sample_sheet:
            pytest.fail(f"Testdaten nicht gefunden!\nIDATs in: {TEST_DATA_DIR}\nSample Sheet: {SAMPLE_SHEET_PATH}")
        
        files = idat_files + [sample_sheet]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 201
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "queued"
        assert len(data["job_id"]) == 36
        
        print(f"\n Upload erfolgreich! Job-ID: {data['job_id']}")
    
    # =========================================================
    # FEHLERTESTS (mit echten Daten, manipuliert)
    # =========================================================
    
    def test_upload_no_idat_files(self):
        """Test: Nur Sample Sheet, keine IDATs"""
        
        sample_sheet = self.get_sample_sheet()
        if not sample_sheet:
            pytest.fail("Sample Sheet nicht gefunden")
        
        files = [sample_sheet]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 422
      
    
    def test_upload_no_sample_sheet(self):
        """Test: Nur IDATs, kein Sample Sheet"""
        
        idat_files = self.get_files()
        if not idat_files:
            pytest.fail("IDAT-Dateien nicht gefunden")
        
        files = idat_files
        
        response = client.post("/api/v1/upload", files=files)
        
        # Backend erwartet sample_sheet Feld
        assert response.status_code == 422 or response.status_code == 400 or response.status_code == 415
        print(f"\n Status: {response.status_code} - Wie erwartet")
    
    def test_upload_invalid_idat_count(self):
        """Test: Ungerade Anzahl IDATs (entferne eine IDAT)"""
        
        idat_files = self.get_files()
        sample_sheet = self.get_sample_sheet()
        
        if not idat_files or not sample_sheet:
            pytest.fail("Testdaten nicht gefunden")
        
        # Entferne die erste IDAT (ungerade Anzahl)
        if len(idat_files) > 1:
            idat_files = idat_files[1:]  # Eine Datei weniger
        
        files = idat_files + [sample_sheet]
        
        response = client.post("/api/v1/upload", files=files)
        
        # Ungerade Anzahl sollte zu Fehler führen
        assert response.status_code == 400
        data = response.json()
        assert "gerade" in str(data).lower() or "paarweise" in str(data)
    
    def test_upload_invalid_idat_extension(self):
        """Test: IDAT mit falscher Endung (umbenannt)"""
        
        idat_files = self.get_files()
        sample_sheet = self.get_sample_sheet()
        
        if not idat_files or not sample_sheet:
            pytest.fail("Testdaten nicht gefunden")
        
        # Ersetze eine IDAT mit einer .txt Datei
        fake_file = ("idat_files", ("fake.txt", b"fake content", "application/octet-stream"))
        
        # Ersetze die erste IDAT
        idat_files[0] = fake_file
        
        files = idat_files + [sample_sheet]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 400
        data = response.json()
        assert ".idat" in str(data) or "Format" in str(data)
    
    def test_upload_invalid_sample_sheet_extension(self):
        """Test: Sample Sheet mit falscher Endung"""
        
        idat_files = self.get_files()
        
        if not idat_files:
            pytest.fail("IDAT-Dateien nicht gefunden")
        
        # Falsches Sample Sheet Format
        files = idat_files + [
            ("sample_sheet", ("samples.pdf", b"fake pdf content", "application/pdf"))
        ]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 415
        data = response.json()
        assert "Format" in str(data) or ".xlsx" in str(data) or ".csv" in str(data)


class TestStatus:
    """Tests für den Status-Endpunkt mit echten Daten"""
    
    def test_status_not_found(self):
        """Test: Nicht existierende job_id"""
        
        response = client.get("/api/v1/status/non-existent-id-12345")
        
        assert response.status_code == 404
        data = response.json()
        assert "JOB_NOT_FOUND" in str(data) or "nicht gefunden" in str(data)
    
    def test_status_success(self):
        """Test: Status einer existierenden Job-ID (mit echten Daten)"""
        
        # 1. Echten Upload durchführen
        test_upload = TestUpload()
        idat_files = test_upload.get_files()
        sample_sheet = test_upload.get_sample_sheet()
        
        if not idat_files or not sample_sheet:
            pytest.fail("Testdaten nicht gefunden")
        
        files = idat_files + [sample_sheet]
        
        upload_response = client.post("/api/v1/upload", files=files)
        assert upload_response.status_code == 201
        
        job_id = upload_response.json()["job_id"]
        
        # 2. Status abfragen
        response = client.get(f"/api/v1/status/{job_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == job_id
        assert data["status"] in ["queued", "running", "completed", "failed"]
        
        print(f"\n Job {job_id} Status: {data['status']}")

