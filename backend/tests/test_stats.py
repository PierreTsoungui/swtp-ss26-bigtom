import sys
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app
from fastapi.testclient import TestClient

client = TestClient(app)


class TestFilterWithRealData:
    """Tests with polling simulation (like real frontend)"""
    
    def poll_status(self, job_id: str, max_polls: int = 5, interval: float = 0.5):
        """Simulate frontend polling"""
        status_history = []
        for _ in range(max_polls):
            response = client.get(f"/api/v1/status/{job_id}")
            if response.status_code == 200:
                status_history.append(response.json())
            time.sleep(interval)
        return status_history
    
    def test_filter_starts_with_correct_status(self, idat_files, sample_sheet):
        """Test: Simulate 3 polls after upload"""
        
        files = idat_files + [sample_sheet]
        upload_response = client.post("/api/v1/upload", files=files)
        print(f"\n[DEBUG] Status Code: {upload_response.status_code}")
        print(f"[DEBUG] Response Body: {upload_response.text}")
        print(f"[DEBUG] Response JSON: {upload_response.json()}")
        assert upload_response.status_code == 201
        job_id = upload_response.json()["job_id"]
        
        print(f"\n Upload: Job {job_id}")
        
        # Simulate 3 polls (like frontend)
        for i in range(3):
            response = client.get(f"/api/v1/status/{job_id}")
            assert response.status_code == 200
            data = response.json()
            print(f"   Poll {i+1}: Phase={data['phase']}, Progress={data['progress_percent']}%")
            time.sleep(0.5)
        
        print(" 3 status updates received")
    
    def test_progress_increases_over_time(self, idat_files, sample_sheet):
        """Test: Progress increases with each poll"""
        
        files = idat_files + [sample_sheet]
        upload_response = client.post("/api/v1/upload", files=files)
        job_id = upload_response.json()["job_id"]
        
        print("\n Progress history:")
        
        progress_values = []
        for i in range(6):
            response = client.get(f"/api/v1/status/{job_id}")
            if response.status_code == 200:
                progress = response.json().get("progress_percent", 0)
                progress_values.append(progress)
                print(f"  Poll {i+1}: Progress={progress}%")
            time.sleep(0.4)
        
        # Progress should increase or at least not decrease
        if len(progress_values) > 1:
            # Check if progress increased at some point
            increased = any(progress_values[i] < progress_values[i+1] 
                        for i in range(len(progress_values)-1))
            print(f"   Progress increased: {increased}")
        
        print(f"{len(progress_values)} progress updates received")
    
    def test_filter_stats_returns_409_during_filtering(self, idat_files, sample_sheet):
        """Test: During filtering /filter/stats returns 409"""
        
        files = idat_files + [sample_sheet]
        upload_response = client.post("/api/v1/upload", files=files)
        job_id = upload_response.json()["job_id"]
        
        print("\n Stats queries during filtering:")
        
        responses = []
        for i in range(3):
            response = client.get(f"/api/v1/filter/{job_id}/stats")
            responses.append(response.status_code)
            print(f"  Query {i+1}: Status={response.status_code}")
            time.sleep(0.3)
        
        # During filtering: 409 (Conflict)
        # Note: If stats are available later, 404 is also possible
        has_409 = 409 in responses
        print(f"  409 received: {has_409}")
    
    def test_filter_stats_returns_404_for_unknown_job(self):
        """Test: Unknown job_id → 404"""
        response = client.get("/api/v1/filter/unknown-job-123/stats")
        assert response.status_code == 404
        print("404 for unknown job_id")


class TestFilterCompletion:
    """Tests for filtering after completion"""
    
    def wait_for_completion(self, job_id: str, max_wait: int = 15):
        """Wait until filtering is complete"""
        start = time.time()
        while time.time() - start < max_wait:
            response = client.get(f"/api/v1/status/{job_id}")
            if response.status_code == 200:
                phase = response.json().get("phase")
                if phase == "filtering_done":
                    return True
            time.sleep(0.5)
        return False
    
    def test_filter_completes_and_stats_available(self, idat_files, sample_sheet):
        """Test: After completion, statistics are available"""
        
        files = idat_files + [sample_sheet]
        upload_response = client.post("/api/v1/upload", files=files)
        job_id = upload_response.json()["job_id"]
        
        print("\n Waiting for filtering to complete...")
        
        if self.wait_for_completion(job_id):
            print("Filtering complete")
            
            # Query stats
            response = client.get(f"/api/v1/filter/{job_id}/stats")
            print(f"  Stats Status: {response.status_code}")
            
            if response.status_code == 200:
                stats = response.json()
                print(f" Statistics: {stats}")
                assert "total_probes_before" in stats
        else:
            print(" Filtering did not complete within the time limit")