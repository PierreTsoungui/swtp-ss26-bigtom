# app/models/normalize.py
"""Request/response models for the normalization step."""
from pydantic import BaseModel


class NormalizeRequest(BaseModel):
    """Body of POST /normalize/{job_id}."""
    method: str


class NormalizeResponse(BaseModel):
    """Acknowledgement returned when normalization is scheduled."""
    job_id: str
    status: str
    method: str
