from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel, Field, field_validator

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
    normalization_method: str= None
    temp_dir: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    preview_plots: List[str] = []

class UploadResponse(BaseModel):
    job_id: str
    status: str
    filter_settings: dict

class NormalizeResponse(BaseModel):
    job_id: str
    status: str
    method: str
class NormalizeRequest(BaseModel):
    method: str
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

# -------------------------
# DET P FILTER
# -------------------------
class FilterDetP(BaseModel):
    enabled: bool = True
    cutoff: float = Field(default=0.01)

    @field_validator("cutoff", mode="before")
    @classmethod
    def validate_cutoff(cls, value):
        try:
            value = float(value)
            if 0.001 <= value <= 0.05:
                return value
        except:
            pass
        return 0.01


# -------------------------
# BEAD COUNT FILTER
# -------------------------
class FilterBeadCount(BaseModel):
    enabled: bool = True
    min_beads: int = Field(default=3)
    sample_fraction: float = Field(default=0.05)

    @field_validator("min_beads", mode="before")
    @classmethod
    def validate_min_beads(cls, value):
        try:
            value = int(value)
            if 1 <= value <= 10:
                return value
        except:
            pass
        return 3

    @field_validator("sample_fraction", mode="before")
    @classmethod
    def validate_sample_fraction(cls, value):
        try:
            value = float(value)
            if 0.0 <= value <= 1.0:
                return value
        except:
            pass
        return 0.05


# -------------------------
# NON CPG FILTER
# -------------------------
class FilterNonCpg(BaseModel):
    enabled: bool = True


# -------------------------
# SNP FILTER
# -------------------------
class FilterSnp(BaseModel):
    enabled: bool = True
    maf: float = Field(default=0.05)

    @field_validator("maf", mode="before")
    @classmethod
    def validate_maf(cls, value):
        try:
            value = float(value)
            if 0.0 <= value <= 1.0:
                return value
        except:
            pass
        return 0.05


# -------------------------
# MULTI HIT FILTER
# -------------------------
class FilterMultiHit(BaseModel):
    enabled: bool = True


# -------------------------
# XY CHROMOSOMES FILTER
# -------------------------
class FilterXyChromosomes(BaseModel):
    enabled: bool = False


# -------------------------
# ROOT SETTINGS
# -------------------------
class FilterSettings(BaseModel):
    det_p: FilterDetP = Field(default_factory=FilterDetP)
    bead_count: FilterBeadCount = Field(default_factory=FilterBeadCount)
    non_cpg: FilterNonCpg = Field(default_factory=FilterNonCpg)
    snp: FilterSnp = Field(default_factory=FilterSnp)
    multi_hit: FilterMultiHit = Field(default_factory=FilterMultiHit)
    xy_chromosomes: FilterXyChromosomes = Field(default_factory=FilterXyChromosomes)