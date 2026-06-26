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
    # URL of the static SVD heatmap (PNG for display; append ?format=pdf for the
    # publication-quality vector download).
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

class SampleSheetColumn(BaseModel):
    """A column the user can assign a role to, with its distinct values."""
    name: str
    levels: int
    values: List[str] = []


class AnalysisStartRequest(BaseModel):
    """Group selection for the DMP/DMR run (chosen on the batch page).

    All optional so the legacy auto-detect path still works, but the frontend
    always sends a column + case + control for a deterministic comparison.
    """
    group_column: Optional[str] = None
    case_group: Optional[str] = None
    control_group: Optional[str] = None

class BatchOptionsResponse(BaseModel):
    job_id: str
    # All columns that group the samples. The same set is offered for both roles
    # (batch / covariate); the roles are conveyed by labels, not by the data —
    # the biologist decides, helped by the sample-sheet preview.
    columns: list[SampleSheetColumn]
    # Backward-compatible flat list of the same names.
    available_columns: list[str]

class SampleSheetPreviewResponse(BaseModel):
    job_id: str
    columns: list[str]
    rows: list[list[str]]
    total_rows: int
    truncated: bool