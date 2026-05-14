import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock

from app.main import app
from app.services.job_manager import create_job, jobs

client = TestClient(app)


@pytest.fixture
def job_id():
    jobs.clear()

    job = create_job(
        "test-job-123",
        "/tmp/test"
    )

    print("\n[TEST] Created Job:", job.job_id)

    return job.job_id



# POST START


def test_start_preview_returns_202(job_id):

    response = client.post(
        f"/api/v1/preview/normalization/{job_id}"
    )

    print("\n[POST RESPONSE]")
    print(response.json())

    assert response.status_code == 202

    data = response.json()

    assert data["job_id"] == job_id
    assert data["status"] == "accepted"



# 409 NOT READY


def test_preview_not_ready_returns_409(job_id):

    response = client.get(
        f"/api/v1/preview/normalization/{job_id}"
    )

    print("\n[409 RESPONSE]")
    print(response.json())

    assert response.status_code == 409

    data = response.json()

    assert data["detail"]["error"] == "PREVIEW_NOT_READY"



# SUCCESS → 5 PLOTS


def test_preview_returns_5_plots(job_id):

    job = jobs[job_id]

    job.phase = "waiting_selection"

    job.preview_plots = [
        "plot1.png",
        "plot2.png",
        "plot3.png",
        "plot4.png",
        "plot5.png",
    ]

    print("\n[JOB STATE BEFORE GET]")
    print("phase:", job.phase)
    print("plots:", job.preview_plots)

    response = client.get(
        f"/api/v1/preview/normalization/{job_id}"
    )

    print("\n[GET RESPONSE]")
    print(response.json())

    assert response.status_code == 200

    data = response.json()

    assert len(data["plots"]) == 5
    assert data["count"] == 5



# EXPIRED


def test_expired_job_returns_410(job_id):

    job = jobs[job_id]

    job.expires_at = job.created_at

    print("\n[EXPIRED JOB]")
    print("created_at:", job.created_at)
    print("expires_at:", job.expires_at)

    response = client.get(
        f"/api/v1/preview/normalization/{job_id}"
    )

    print("\n[410 RESPONSE]")
    print(response.json())

    assert response.status_code == 410

    data = response.json()

    assert data["detail"]["error"] == "SESSION_EXPIRED"



# BACKGROUND TASK / STATUS


@patch(
    "app.services.normalization_preview_service.run_r_script",
    new_callable=AsyncMock
)
def test_preview_status_changes(
    mock_r_script,
    job_id
):

    mock_r_script.return_value = {
        "returncode": 0,
        "preview_plots": [
            "p1.png",
            "p2.png",
            "p3.png",
            "p4.png",
            "p5.png"
        ]
    }

    response = client.post(
        f"/api/v1/preview/normalization/{job_id}"
    )

    print("\n[BACKGROUND TASK RESPONSE]")
    print(response.json())

    job = jobs[job_id]

    print("\n[JOB STATE AFTER POST]")
    print("status:", job.status)
    print("phase:", job.phase)
    print("progress:", job.progress_percent)
    print("plots:", getattr(job, "preview_plots", []))

    assert response.status_code == 202

    assert job.phase in [
        "normalization_preview",
        "waiting_selection"
    ]