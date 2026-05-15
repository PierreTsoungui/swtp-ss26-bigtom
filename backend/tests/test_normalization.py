# tests/test_normalization.py
import pytest
import time
import tempfile
from fastapi.testclient import TestClient

from app.main import app
from app.services.job_manager import create_job, create_job, delete_job, delete_job, get_job


client = TestClient(app)


class TestNormalization:
    """Tests für POST /normalize/{job_id}"""
    
    def create_waiting_job(self):
        """Erstellt einen Job im Status waiting_selection"""
        job_id = f"test-normalize-{int(time.time())}"
        job_dir = tempfile.mkdtemp()
        
        create_job(job_id, job_dir)
        job=get_job(job_id)
        job.status = "waiting_selection"
        job.phase = "filtering"
        job.progress_percent = 100
        return job_id
    
  
   
    
    @pytest.mark.parametrize("method", ["noob", "quantile", "swan", "funnorm"])
    def test_valid_methods_accepted(self, method):
        """pytest: Alle 4 gültigen Methoden werden akzeptiert"""
        job_id = self.create_waiting_job()
        
        try:
            response = client.post(
                f"/api/v1/normalize/{job_id}",
                json={"method": method}
            )
            
            assert response.status_code == 202
            data = response.json()
            assert data["method"] == method
            assert data["status"] == "normalizing"
            
        finally:
           
            delete_job(job_id)
    
    def test_invalid_method_returns_400(self):
        """pytest: Ungültige Methode gibt 400 zurück"""
        job_id = self.create_waiting_job()
        
        try:
            response = client.post(
                f"/api/v1/normalize/{job_id}",
                json={"method": "invalid_method_xyz"}
            )
            
            assert response.status_code == 400
           
            
        finally:
           
            delete_job(job_id)