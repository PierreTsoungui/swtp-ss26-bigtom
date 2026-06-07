"""Initialisiert die FastAPI-Anwendung und ihre Hintergrunddienste."""

import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.error_types import AppException, app_exception_handler
from app.services.job_cleanup_service import run_job_cleanup_loop

from app.api.routes import (
    upload,
    status,
    stats,
    normalization_preview,
    normalize,
    reset,
    batch
)

from app.api.routes.table import router as table_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startet den Cleanup-Dienst mit der Anwendung und beendet ihn beim Shutdown."""
    cleanup_task = asyncio.create_task(
        run_job_cleanup_loop(),
        name="job-cleanup",
    )
    app.state.job_cleanup_task = cleanup_task

    try:
        yield
    finally:
        cleanup_task.cancel()
        with suppress(asyncio.CancelledError):
            await cleanup_task


app = FastAPI(
    title="Methylation Analysis API",
    version="1.0",
    lifespan=lifespan,
)

app.add_exception_handler(AppException, app_exception_handler)

# CORS für lokale Entwicklung
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:8080"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------
# ROUTES
# ------------------------------------------------------------

app.include_router(
    upload.router,
    prefix="/api/v1",
    tags=["Upload"]
)

app.include_router(
    status.router,
    prefix="/api/v1",
    tags=["Status"]
)

app.include_router(
    stats.router,
    prefix="/api/v1",
    tags=["Filter"]
)

app.include_router(
    normalization_preview.router,
    prefix="/api/v1",
    tags=["Normalization Preview"]
)

app.include_router(
    normalize.router,
    prefix="/api/v1",
    tags=["Normalize"]
)

app.include_router(
    reset.router,
    prefix="/api/v1",
    tags=["Reset"]
)

app.include_router(
    table_router,
    prefix="/api/v1"
)

app.include_router(
    batch.router,
    prefix="/api/v1/batch",
    tags=["Batch Correction"]
)

@app.get("/")
async def root():
    return {
        "message": "Methylation Analysis API",
        "version": "1.0"
    }
