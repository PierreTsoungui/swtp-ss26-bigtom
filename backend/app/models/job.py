# app/models/job.py
"""Job-state models.

``JobStatus`` is the in-memory domain object the state machine mutates;
``StatusResponse`` is the read model the frontend polls. Request/response models
for individual pipeline steps live in their own domain modules
(``upload.py``, ``normalize.py``, ``filter.py``, ``batch.py``, ``heatmap.py``,
``table.py``).
"""

from typing import Any

from pydantic import BaseModel


class JobStatus(BaseModel):
    """Internal job model — stored in the job_manager registry."""

    job_id: str
    status: str
    phase: str
    progress_percent: int
    current_step: str
    error: dict[str, Any] | None = None


class StatusResponse(BaseModel):
    """Job status as returned by GET /status/{job_id} (UPPC-conformant)."""

    job_id: str
    status: str
    phase: str
    progress_percent: int
    current_step: str
    error: dict[str, Any] | None = None
