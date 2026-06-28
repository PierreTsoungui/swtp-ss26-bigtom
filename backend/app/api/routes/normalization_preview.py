# app/api/routes/normalization_preview.py
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from app.services.job_manager import get_job, JobPhase, JobStatusValue

router = APIRouter()

JOBS_DIR = Path("jobs").resolve()

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
        return {"error": f"PCA-Daten konnten nicht gelesen werden: {exc}", "points": []}


@router.get("/preview/normalization/{job_id}")
async def get_preview(job_id: str):
    job = get_job(job_id)

    if not job:
        raise HTTPException(
            status_code=404,
            detail={"error": "JOB_NOT_FOUND", "message": "Kein Job gefunden"},
        )

    # Preview liegt erst ab normalization_preview/completed vor
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
                "message": "Normalisierungs-Preview noch nicht verfügbar",
                "current_phase": job.phase,
                "current_status": job.status,
            },
        )

    # preview_plots.json vom Dateisystem lesen
    plots_path = JOBS_DIR / job_id / "preview_plots.json"
    if not plots_path.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "PREVIEW_NOT_READY", "message": "preview_plots.json nicht gefunden"},
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
    job = get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Job nicht gefunden")

    suffix = Path(plot_name).suffix.lower()
    if (
        not plot_name.startswith(_ALLOWED_PLOT_PREFIXES)
        or suffix not in _MEDIA_BY_SUFFIX
        or any(sep in plot_name for sep in ("/", "\\"))
        or ".." in plot_name
    ):
        raise HTTPException(status_code=400, detail="Ungültiger Plot-Name")

    job_dir = (JOBS_DIR / job_id).resolve()
    path = (job_dir / plot_name).resolve()
    if job_dir not in path.parents:
        raise HTTPException(status_code=400, detail="Ungültiger Plot-Name")
    if not path.exists():
        raise HTTPException(status_code=404, detail="Plot nicht gefunden")

    return FileResponse(path, media_type=_MEDIA_BY_SUFFIX[suffix])