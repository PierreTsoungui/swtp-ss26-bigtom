# app/models/upload.py
"""Response models for the upload step."""
from pydantic import BaseModel


class UploadResponse(BaseModel):
    """Acknowledgement returned after a successful upload. ``filter_settings``
    echoes the effective (validated) filter configuration back to the client."""
    job_id:          str
    status:          str
    filter_settings: dict
