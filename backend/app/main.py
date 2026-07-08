# app/main.py
"""Initializes the FastAPI application and its background services."""
import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import (
    CORS_ALLOWED_ORIGINS,
    STAGING_BASE_DIR,
    STAGING_CLEANUP_INTERVAL_SECONDS,
    STAGING_RETENTION_HOURS,
)
from app.core.error_types import AppException, app_exception_handler
from app.services.job_cleanup_service import run_job_cleanup_loop
from app.api.routes import (
    upload,
    status,
    stats,
    normalization_preview,
    normalize,
    reset,
    batch,
    heatmap,
)
from app.api.routes.table import router as table_router

import logging
from app.core.logging_config import setup_logging 

setup_logging() 

logger = logging.getLogger(__name__)  

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the cleanup services with the application and stop them on shutdown."""
    # Reuse the generic cleanup loop for both the job and the staging directories
    # (TTL-based deletion of expired subdirectories by mtime).
    cleanup_task = asyncio.create_task(run_job_cleanup_loop(), name="job-cleanup")
    staging_cleanup_task = asyncio.create_task(
        run_job_cleanup_loop(
            jobs_dir=STAGING_BASE_DIR,
            retention_hours=STAGING_RETENTION_HOURS,
            interval_seconds=STAGING_CLEANUP_INTERVAL_SECONDS,
        ),
        name="staging-cleanup",
    )
    app.state.job_cleanup_task = cleanup_task
    app.state.staging_cleanup_task = staging_cleanup_task
    try:
        yield
    finally:
        for task in (cleanup_task, staging_cleanup_task):
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

app = FastAPI(title="Methylation Analysis API", version="1.0", lifespan=lifespan)
# Starlette types the handler against the base Exception; our handler narrows to
# AppException, which is the intended, documented FastAPI pattern.
app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
# Origins come from configuration (CORS_ALLOWED_ORIGINS) so production can lock
# them down without a code change. Methods and headers are restricted to what the
# API actually uses instead of a blanket wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept", "Authorization", "Origin"],
)

# ── Security Headers ────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    return response

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(upload.router,                prefix="/api/v1",         tags=["Upload"])
app.include_router(status.router,                prefix="/api/v1",         tags=["Status"])
app.include_router(stats.router,                 prefix="/api/v1",         tags=["Filter"])
app.include_router(normalization_preview.router, prefix="/api/v1",         tags=["Normalization Preview"])
app.include_router(normalize.router,             prefix="/api/v1",         tags=["Normalize"])
app.include_router(reset.router,                 prefix="/api/v1",         tags=["Reset"])
app.include_router(table_router,                 prefix="/api/v1")
app.include_router(batch.router,                 prefix="/api/v1/batch",   tags=["Batch Correction"])
app.include_router(heatmap.router,               prefix="/api/v1/heatmap", tags=["Heatmap"])

@app.get("/")
async def root():
    """Return the API name and version."""
    return {"message": "Methylation Analysis API", "version": "1.0"}


@app.get("/health", tags=["Health"])
async def health():
    """Liveness/readiness probe: returns 200 while the process is serving.

    Deliberately dependency-free (no disk or subprocess checks) so container and
    orchestrator health checks stay cheap and cannot be tripped by a slow job.
    """
    return {"status": "ok"}
