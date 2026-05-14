from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import upload, status, stats, normalization_preview

app = FastAPI(title="Methylation Analysis API", version="1.0")

# CORS für lokale Entwicklung
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routen registrieren
app.include_router(upload.router, prefix="/api/v1", tags=["upload"])
app.include_router(status.router, prefix="/api/v1", tags=["status"])
app.include_router(stats.router, prefix="/api/v1", tags=["stats"])
app.include_router(normalization_preview.router, prefix="/api/v1", tags=["normalization_preview"])

@app.get("/")
async def root():
    return {"message": "Methylation Analysis API", "version": "1.0"}