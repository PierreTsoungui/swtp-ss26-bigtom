
import pytest
from fastapi.testclient import TestClient
from pathlib import Path
import sys
import os

# Damit wir die app importieren können
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

client = TestClient(app)


class TestUpload:
    """Tests für den Upload-Endpunkt"""
    
    def create_test_file(self, field: str, filename: str, content: bytes = b"test") -> tuple:
        """Hilfsfunktion zum Erstellen von Test-Dateien"""
        return (field, (filename, content, "application/octet-stream"))
    
    # =========================================================
    # ERFOLGREICHE TESTS
    # =========================================================
    
    def test_upload_success(self):
        """Test: Erfolgreicher Upload mit gültigen Dateien"""
        
        # 2 Samples = 4 IDATs
        files = [
            self.create_test_file("idat_files", "sample1_Red.idat", b"mock"),
            self.create_test_file("idat_files", "sample1_Grn.idat", b"mock"),
            self.create_test_file("idat_files", "sample2_Red.idat", b"mock"),
            self.create_test_file("idat_files", "sample2_Grn.idat", b"mock"),
            self.create_test_file("sample_sheet", "samples.csv", b"Sample_Name\nsample1\nsample2")
        ]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 201
        data = response.json()
        assert "job_id" in data
        assert data["status"] == "queued"
        assert len(data["job_id"]) == 36  # UUID Länge
    
    # =========================================================
    # FEHLERTESTS - IDATs
    # =========================================================
    
    def test_upload_no_idat_files(self):
        """Test: Keine IDAT-Dateien hochgeladen"""
        
        files = [
            self.create_test_file("sample_sheet", "samples.csv", b"Sample_Name\nsample1")
        ]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 400
        data = response.json()
        assert "FILE_MISSING" in str(data)
    
    def test_upload_invalid_idat_count(self):
        """Test: Ungerade Anzahl IDAT-Dateien"""
        
        # Nur 1 IDAT (ungerade)
        files = [
            self.create_test_file("idat_files", "sample1_Red.idat", b"mock"),
            self.create_test_file("sample_sheet", "samples.csv", b"Sample_Name\nsample1")
        ]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 400
        data = response.json()
        assert "gerade" in str(data) or "even" in str(data).lower()
    
    def test_upload_invalid_idat_extension(self):
        """Test: Falsche Dateiendung bei IDAT"""
        
        files = [
            self.create_test_file("idat_files", "sample1.txt", b"mock"),
            self.create_test_file("idat_files", "sample1_Grn.idat", b"mock"),
            self.create_test_file("sample_sheet", "samples.csv", b"Sample_Name\nsample1")
        ]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 400
        data = response.json()
        assert ".idat" in str(data)
    
    # =========================================================
    # FEHLERTESTS - Sample Sheet
    # =========================================================
    
    def test_upload_no_sample_sheet(self):
        """Test: Kein Sample Sheet hochgeladen"""
        
        files = [
            self.create_test_file("idat_files", "sample1_Red.idat", b"mock"),
            self.create_test_file("idat_files", "sample1_Grn.idat", b"mock")
        ]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 415  # oder 400
        data = response.json()
        assert "sample" in str(data).lower()
    
    def test_upload_invalid_sample_sheet_extension(self):
        """Test: Falsche Dateiendung bei Sample Sheet"""
        
        files = [
            self.create_test_file("idat_files", "sample1_Red.idat", b"mock"),
            self.create_test_file("idat_files", "sample1_Grn.idat", b"mock"),
            self.create_test_file("sample_sheet", "samples.pdf", b"mock")
        ]
        
        response = client.post("/api/v1/upload", files=files)
        
        assert response.status_code == 415
        data = response.json()
        assert ".xlsx" in str(data) or "Format" in str(data)


class TestStatus:
    """Tests für den Status-Endpunkt"""
    
    def test_status_not_found(self):
        """Test: Nicht existierende job_id"""
        
        response = client.get("/api/v1/status/non-existent-id")
        
        assert response.status_code == 404
        data = response.json()
        assert "JOB_NOT_FOUND" in str(data) or "nicht gefunden" in str(data)
    
    def test_status_success(self):
        """Test: Status einer existierenden Job-ID"""
        
        # Erst einen Job erstellen
        files = [
            self.create_test_file("idat_files", "sample1_Red.idat", b"mock"),
            self.create_test_file("idat_files", "sample1_Grn.idat", b"mock"),
            self.create_test_file("sample_sheet", "samples.csv", b"Sample_Name\nsample1")
        ]
        
        upload_response = client.post("/api/v1/upload", files=files)
        job_id = upload_response.json()["job_id"]
        
        # Dann Status abfragen
        response = client.get(f"/api/v1/status/{job_id}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["job_id"] == job_id
        assert data["status"] in ["queued", "running", "completed", "failed"]