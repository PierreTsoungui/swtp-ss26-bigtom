from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel

class JobStatus(BaseModel):
    job_id: str
    status: str  # queued, running, waiting, completed, failed, canceled
    phase: str   # uploaded, validating, filtering, waiting_selection, etc.
    progress_percent: int
    current_step: str
    steps_total: int = 6
    steps_completed: int = 0
    filter_stats: Optional[Dict] = None
    estimated_seconds_remaining: Optional[int] = None
    error_message: Optional[str] = None
    temp_dir: Optional[str] = None
    created_at: datetime
    expires_at: datetime

class UploadResponse(BaseModel):
    job_id: str
    status: str

class StatusResponse(BaseModel):
    job_id: str
    status: str
    phase: str
    progress_percent: int
    current_step: str
    steps_total: int
    steps_completed: int
    filter_stats: Optional[Dict] = None
    estimated_seconds_remaining: Optional[int] = None