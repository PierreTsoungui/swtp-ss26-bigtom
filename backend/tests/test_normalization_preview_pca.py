"""Tests for the split preview contract: density PNG + PCA JSON.

The normalization preview now ships density plots as PNG files and PCA data as
JSON (rendered interactively in the frontend). These tests pin that contract on
the service scan helper and on the GET route.
"""
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.api.routes import normalization_preview as preview_route
from app.services.job_manager import create_job, jobs, JobPhase, JobStatusValue
from app.services.normalization_preview_service import _scan_preview_artifacts

client = TestClient(app)


def _make_pca(job_dir: Path, method: str):
    (job_dir / f"density_{method}.png").write_bytes(b"\x89PNG\r\n")
    (job_dir / f"pca_{method}.json").write_text(
        json.dumps({
            "method": method.upper(),
            "axes": {"x": "PC1", "y": "PC2"},
            "variance_explained": {"pc1": 40.0, "pc2": 20.0},
            "points": [
                {"sample": "HeLa", "group": "Cellline", "pc1": 1.2, "pc2": -0.5},
                {"sample": "NA12878", "group": "Coriell", "pc1": -1.1, "pc2": 0.7},
            ],
        }),
        encoding="utf-8",
    )


def test_scan_pairs_density_and_pca_per_method(tmp_path):
    _make_pca(tmp_path, "raw")
    _make_pca(tmp_path, "noob")
    # An unrelated json must be ignored.
    (tmp_path / "filter_settings.json").write_text("{}", encoding="utf-8")

    artifacts = _scan_preview_artifacts(tmp_path)

    assert set(artifacts) == {"raw", "noob"}
    assert artifacts["raw"] == {"density": "density_raw.png", "pca": "pca_raw.json"}
    assert "filter_settings" not in artifacts


def test_get_preview_returns_density_url_and_inline_pca(tmp_path, monkeypatch):
    monkeypatch.setattr(preview_route, "JOBS_DIR", tmp_path)
    jobs.clear()

    job_id = "prev-job-1"
    job = create_job(job_id)
    job.phase = JobPhase.NORMALIZATION_PREVIEW.value
    job.status = JobStatusValue.COMPLETED.value

    job_dir = tmp_path / job_id
    job_dir.mkdir()
    _make_pca(job_dir, "raw")
    (job_dir / "preview_plots.json").write_text(
        json.dumps({"raw": {"density": "density_raw.png", "pca": "pca_raw.json"}}),
        encoding="utf-8",
    )

    resp = client.get(f"/api/v1/preview/normalization/{job_id}")
    assert resp.status_code == 200

    data = resp.json()
    assert data["job_id"] == job_id
    method = data["methods"][0]
    assert method["method"] == "raw"
    assert method["density_url"].endswith("/density_raw.png")
    # PCA is inlined, not a URL.
    assert method["pca"]["points"][0]["sample"] == "HeLa"
    assert method["pca"]["variance_explained"]["pc1"] == 40.0


def test_pca_files_are_not_served_as_images(tmp_path, monkeypatch):
    monkeypatch.setattr(preview_route, "JOBS_DIR", tmp_path)
    jobs.clear()

    job_id = "prev-job-2"
    create_job(job_id)
    job_dir = tmp_path / job_id
    job_dir.mkdir()
    (job_dir / "pca_raw.json").write_text("{}", encoding="utf-8")

    # Only density_* images may be fetched through the image endpoint.
    resp = client.get(f"/api/v1/preview/normalization/{job_id}/pca_raw.json")
    assert resp.status_code == 400
