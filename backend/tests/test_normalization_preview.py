"""Tests for the normalization-preview API.

Fully isolated from the working directory: the route's jobs base is redirected
into ``tmp_path``, so nothing is read from or written to the real ./jobs
directory and the tests do not depend on the process CWD.
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.routes import normalization_preview as preview_route
from app.main import app
from app.services.job_manager import (
    JobPhase,
    JobStatusValue,
    create_job,
    jobs,
    transition_job,
)

client = TestClient(app)


@pytest.fixture
def job_id():
    jobs.clear()
    return create_job("test-job-123").job_id


@pytest.fixture
def job_dir(job_id, tmp_path, monkeypatch):
    """Redirect the route's jobs base into tmp_path and return the job directory."""
    jobs_base = tmp_path / "jobs"
    monkeypatch.setattr(preview_route, "JOBS_DIR", jobs_base)
    job_path = jobs_base / job_id
    job_path.mkdir(parents=True, exist_ok=True)
    return job_path


def _write_preview(job_path: Path, methods: dict) -> None:
    """Write preview_plots.json plus the density PNG and PCA JSON it references.

    ``methods`` maps ``method -> {"density": <png name>, "pca": <json name>}``.
    """
    (job_path / "preview_plots.json").write_text(json.dumps(methods), encoding="utf-8")
    for artifacts in methods.values():
        if artifacts.get("density"):
            (job_path / artifacts["density"]).touch()
        if artifacts.get("pca"):
            (job_path / artifacts["pca"]).write_text('{"points": []}', encoding="utf-8")


def _mark_preview_ready(job_id: str) -> None:
    """Drive a job through the transitions up to a completed preview."""
    for phase, status, pct in (
        (JobPhase.UPLOADED, JobStatusValue.COMPLETED, 100),
        (JobPhase.FILTERING, JobStatusValue.RUNNING, 0),
        (JobPhase.FILTERING, JobStatusValue.COMPLETED, 100),
        (JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.RUNNING, 0),
        (JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.COMPLETED, 100),
    ):
        transition_job(job_id, new_phase=phase, new_status=status, progress_percent=pct)


# ── GET /preview/normalization/{job_id} ───────────────────────────────────────


def test_preview_returns_all_methods_when_ready(job_id, job_dir):
    methods = {
        m: {"density": f"density_{m}.png", "pca": f"pca_{m}.json"}
        for m in ("raw", "noob", "quantile", "swan", "funnorm")
    }
    _write_preview(job_dir, methods)
    _mark_preview_ready(job_id)

    response = client.get(f"/api/v1/preview/normalization/{job_id}")

    assert response.status_code == 200
    data = response.json()
    assert data["job_id"] == job_id
    assert {m["method"] for m in data["methods"]} == set(methods)


def test_preview_not_ready_returns_409(job_id):
    transition_job(
        job_id,
        new_phase=JobPhase.UPLOADED,
        new_status=JobStatusValue.COMPLETED,
        progress_percent=0,
        current_step="Upload complete",
    )
    response = client.get(f"/api/v1/preview/normalization/{job_id}")
    assert response.status_code == 409
    assert response.json()["detail"]["error"] == "PREVIEW_NOT_READY"


def test_preview_missing_plots_file_returns_404(job_id, job_dir):
    # The job is ready, but preview_plots.json was never written.
    _mark_preview_ready(job_id)
    response = client.get(f"/api/v1/preview/normalization/{job_id}")
    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "PREVIEW_NOT_READY"


def test_preview_unknown_job_returns_404():
    response = client.get("/api/v1/preview/normalization/does-not-exist")
    assert response.status_code == 404
    assert response.json()["detail"]["error"] == "JOB_NOT_FOUND"


def test_post_preview_is_not_allowed(job_id):
    # The preview runs automatically within the upload pipeline; there is no
    # manual POST trigger, so the method is not allowed.
    response = client.post(f"/api/v1/preview/normalization/{job_id}")
    assert response.status_code == 405


# ── GET /preview/normalization/{job_id}/{plot_name} ───────────────────────────


def test_plot_image_served_when_present(job_id, job_dir):
    (job_dir / "density_raw.png").write_bytes(b"\x89PNG fake")
    response = client.get(f"/api/v1/preview/normalization/{job_id}/density_raw.png")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_plot_image_invalid_name_returns_400(job_id, job_dir):
    # Not an allowed density_* prefix.
    response = client.get(f"/api/v1/preview/normalization/{job_id}/not_allowed.png")
    assert response.status_code == 400
    assert "Invalid" in str(response.json())


def test_plot_image_missing_file_returns_404(job_id, job_dir):
    response = client.get(f"/api/v1/preview/normalization/{job_id}/density_missing.png")
    assert response.status_code == 404


def test_plot_image_unknown_job_returns_404():
    response = client.get("/api/v1/preview/normalization/does-not-exist/density_raw.png")
    assert response.status_code == 404
