# app/models/batch.py
"""Pydantic schemas for the batch-correction and downstream-analysis API."""

from typing import Any

from pydantic import BaseModel


class BatchSettingsInner(BaseModel):
    """Batch-correction settings: the batch variable and its covariates."""

    batch_variable: str
    covariates: list[str] = []


class BatchSettingsPayload(BaseModel):
    """Request body wrapping the batch-correction settings."""

    batch_correction: BatchSettingsInner


class BatchRound(BaseModel):
    """One entry in the batch-correction history (the baseline or a correction)."""

    round: int
    type: str
    # URL of the static SVD heatmap (PNG for display; append ?format=pdf for the
    # publication-quality vector download).
    svd_plot: str
    settings_used: dict[str, Any] | None = None
    timestamp: str


class BatchHistoryResponse(BaseModel):
    """Full batch-correction history for a job."""

    job_id: str
    rounds: list[BatchRound]
    current_round: int
    correction_applied: bool


class BatchRunResponse(BaseModel):
    """Response returned when a batch-correction run is accepted."""

    job_id: str
    status: str
    round: int


class BatchSkipResponse(BaseModel):
    """Response returned when batch correction is skipped."""

    job_id: str
    status: str


class SampleSheetColumn(BaseModel):
    """A column the user can assign a role to, with its distinct values."""

    name: str
    levels: int
    values: list[str] = []


class AnalysisStartRequest(BaseModel):
    """Group selection for the DMP/DMR run (chosen on the batch page).

    All fields are optional so the legacy auto-detect path still works, but the
    frontend always sends a column plus case and control groups for a
    deterministic comparison.
    """

    group_column: str | None = None
    case_group: str | None = None
    control_group: str | None = None


class BatchOptionsResponse(BaseModel):
    """Grouping columns offered for the batch-variable and covariate roles."""

    job_id: str
    # All columns that group the samples. The same set is offered for both roles
    # (batch / covariate); the roles are conveyed by labels, not by the data —
    # the biologist decides, helped by the sample-sheet preview.
    columns: list[SampleSheetColumn]
    # Backward-compatible flat list of the same names.
    available_columns: list[str]


class SampleSheetPreviewResponse(BaseModel):
    """Tabular preview of the sample sheet for role assignment."""

    job_id: str
    columns: list[str]
    rows: list[list[str]]
    total_rows: int
    truncated: bool
