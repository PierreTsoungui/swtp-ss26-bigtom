# app/models/heatmap.py

from pydantic import BaseModel, Field
from typing import Dict, List, Optional


# ── Request Models ─────────────────────────────────────────────────────────────

class GroupingPayload(BaseModel):
    primary:   str
    secondary: Optional[str] = None


class HeatmapRequest(BaseModel):
    """
    The heatmap reuses the *exact same* filters as the DMP table view. The
    frontend sends the currently applied table filters as a flat map of
    ``{filter_key: value}`` (same keys as the table, e.g. ``chr``, ``gene``,
    ``feature`` …). The backend applies them through the single shared filter
    layer (``table_filter.apply_filters``) so the heatmap is guaranteed to show
    exactly the rows visible in the table — see
    ``docs/architecture/heatmap-konzept.md``.
    """
    filters:  Dict[str, str] = Field(default_factory=dict)
    grouping: GroupingPayload


# ── Response Models ────────────────────────────────────────────────────────────

class HeatmapMetadata(BaseModel):
    detected_cpgs:   int
    plotted_samples: int
    message:         str


class HeatmapRunResponse(BaseModel):
    job_id:           str
    phase:            str = "heatmap"
    status:           str
    heatmap_metadata: HeatmapMetadata


class AnnotationColumn(BaseModel):
    """A sample-sheet column offered as a heatmap annotation (primary/secondary)."""
    name:       str
    type:       str   # "categorical" | "continuous" | "identifier"
    n_distinct: int


class HeatmapOptionsResponse(BaseModel):
    job_id:            str
    available_columns: List[AnnotationColumn]

    class Config:
        from_attributes = True
