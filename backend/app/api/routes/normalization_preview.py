# app/api/routes/normalization_preview.py
"""Routes for the normalization preview (per-method density/PCA plots)."""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.services.job_manager import get_job, JobPhase, JobStatusValue
from app.services.job_paths import JOBS_DIR, validate_job_id

router = APIRouter()

# Density plots are served as static files; PCA data is inlined as JSON in the
# preview response (the frontend renders it), so only density figures are
# fetchable through this endpoint. Each density plot exists as PNG (display +
# export) and PDF (export).
_ALLOWED_PLOT_PREFIXES = ("density_",)
_MEDIA_BY_SUFFIX = {".png": "image/png", ".pdf": "application/pdf"}


def _load_pca_json(job_dir: Path, filename: str) -> dict:
    """Read a pca_<method>.json file, returning an error payload on failure."""
    try:
        with open(job_dir / filename, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return {"error": f"PCA data could not be read: {exc}", "points": []}


@router.get("/preview/normalization/{job_id}")
async def get_preview(job_id: str):
    """Return the per-method normalization preview (density URLs + inline PCA data).

    Raises:
        HTTPException: 404 if the job is unknown or the preview is missing, 409
            if the preview is not ready yet.
    """
    validate_job_id(job_id)  # traversal guard before the id reaches the FS
    job = get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail={"error": "JOB_NOT_FOUND", "message": "No job found"},
        )

    # The preview is available from normalization_preview/completed onwards
    preview_ready = (
        job.phase == JobPhase.NORMALIZATION_PREVIEW.value
        and job.status == JobStatusValue.COMPLETED.value
    ) or job.phase not in {
        JobPhase.UPLOADED.value,
        JobPhase.FILTERING.value,
        JobPhase.NORMALIZATION_PREVIEW.value,
    }

    if not preview_ready:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "PREVIEW_NOT_READY",
                "message": "Normalization preview not available yet",
                "current_phase": job.phase,
                "current_status": job.status,
            },
        )

    # Read preview_plots.json from the filesystem
    plots_path = JOBS_DIR / job_id / "preview_plots.json"
    if not plots_path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "PREVIEW_NOT_READY", "message": "preview_plots.json not found"},
        )

    with open(plots_path, "r", encoding="utf-8") as f:
        preview_plots = json.load(f)

    job_dir = JOBS_DIR / job_id

    # Per method: the density plot as an image URL, the PCA data inlined as JSON
    # so the frontend plotter can render it (dynamic colours, labels, export).
    methods = []
    for method, artifacts in preview_plots.items():
        density_file = artifacts.get("density")
        pca_file = artifacts.get("pca")
        methods.append({
            "method": method.lower(),
            "density_url": (
                f"/api/v1/preview/normalization/{job_id}/{density_file}"
                if density_file else None
            ),
            "pca": _load_pca_json(job_dir, pca_file) if pca_file else None,
        })

    return {"job_id": job_id, "methods": methods}


@router.get("/preview/normalization/{job_id}/{plot_name}")
async def get_plot_image(job_id: str, plot_name: str):
    """Return a single density preview plot (PNG/PDF) for a job.

    Raises:
        HTTPException: 404 if the job or plot is missing, 400 for an invalid or
            traversal-unsafe plot name.
    """
    validate_job_id(job_id)  # traversal guard before the id reaches the FS
    job = get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    suffix = Path(plot_name).suffix.lower()
    if (
        not plot_name.startswith(_ALLOWED_PLOT_PREFIXES)
        or suffix not in _MEDIA_BY_SUFFIX
        or any(sep in plot_name for sep in ("/", "\\"))
        or ".." in plot_name
    ):
        raise HTTPException(status_code=400, detail="Invalid plot name")

    job_dir = (JOBS_DIR / job_id).resolve()
    path = (job_dir / plot_name).resolve()
    if job_dir not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid plot name")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Plot not found")

    return FileResponse(path, media_type=_MEDIA_BY_SUFFIX[suffix])