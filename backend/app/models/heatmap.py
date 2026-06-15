# app/models/heatmap.py

from pydantic import BaseModel, Field
from typing import List, Optional


# ── Request Models ─────────────────────────────────────────────────────────────

class DmpFilterPayload(BaseModel):
    """
    Optionale Filter zur Einschränkung der CpG-Auswahl.
    Alle Felder sind optional – nicht gesetzte Felder werden ignoriert.
    """
    dmr_id:           Optional[str]   = Field(None,  description="Filtert auf eine spezifische DMR-ID")
    chromosome:       Optional[str]   = Field(None,  description="Chromosom, z. B. 'chr19'")
    start:            Optional[int]   = Field(None,  description="Genomische Startposition (inklusiv)")
    stop:             Optional[int]   = Field(None,  description="Genomische Endposition (inklusiv)")
    p_value_max:      Optional[float] = Field(None,  ge=0.0, le=1.0)
    adj_p_value_max:  Optional[float] = Field(None,  ge=0.0, le=1.0)
    delta_beta_min:   Optional[float] = Field(None,  ge=-1.0, le=1.0)
    delta_beta_max:   Optional[float] = Field(None,  ge=-1.0, le=1.0)


class GroupingPayload(BaseModel):
    primary:   str
    secondary: Optional[str] = None


class HeatmapRequest(BaseModel):
    dmp_filter: Optional[DmpFilterPayload] = None
    grouping:   GroupingPayload


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


class HeatmapOptionsResponse(BaseModel):
    job_id:            str
    available_columns: List[str]

    class Config:
        from_attributes = True