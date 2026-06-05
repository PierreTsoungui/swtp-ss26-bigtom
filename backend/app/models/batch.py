# app/models/batch.py
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class BatchSettingsInner(BaseModel):
    batch_variable: str
    covariates: List[str] = []

class BatchSettingsPayload(BaseModel):
    batch_correction: BatchSettingsInner

class BatchRound(BaseModel):
    round: int
    type: str
    svd_plot: str
    settings_used: Optional[Dict[str, Any]] = None
    timestamp: str

class BatchHistoryResponse(BaseModel):
    job_id: str
    rounds: List[BatchRound]
    current_round: int
    correction_applied: bool

class BatchRunResponse(BaseModel):
    job_id: str
    status: str
    round: int

class BatchSkipResponse(BaseModel):
    job_id: str
    status: str

class BatchOptionsResponse(BaseModel):
    job_id: str
    available_columns: list[str]