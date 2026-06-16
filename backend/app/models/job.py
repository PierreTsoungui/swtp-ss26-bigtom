# app/models/job.py

from datetime import datetime
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field, field_validator


class JobStatus(BaseModel):
    """Internes Job-Modell — wird im jobs-Dict gespeichert."""
    job_id:           str
    status:           str
    phase:            str
    progress_percent: int
    current_step:     str
    error:            Optional[Dict[str, Any]] = None


class StatusResponse(BaseModel):
    """UPPC-konforme API-Response — exakt das, was das Frontend bekommt."""
    job_id:           str
    status:           str
    phase:            str
    progress_percent: int
    current_step:     str
    error:            Optional[Dict[str, Any]] = None

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

# -------------------------
# DET P FILTER
# -------------------------
class FilterDetP(BaseModel):
    enabled: bool = False
    cutoff: float = Field(default=0.01)

    @field_validator("cutoff", mode="before")
    @classmethod
    def validate_cutoff(cls, v):
        try:
            v = float(v)
            if 0.01 <= v <= 0.05:
                return v
        except:
            pass
        return 0.01


# -------------------------
# BEAD COUNT FILTER
# -------------------------
class FilterBeadCount(BaseModel):
    enabled: bool = False
    bead_cutoff: float = Field(default=0.05)

    @field_validator("bead_cutoff", mode="before")
    @classmethod
    def validate_bead_cutoff(cls, v):
        try:
            v = float(v)
            if 0.01 <= v <= 0.1:
                return v
        except:
            pass
        return 0.05


# -------------------------
# NON CPG FILTER
# -------------------------
class FilterNonCpg(BaseModel):
    enabled: bool = False


# -------------------------
# SNP FILTER
# -------------------------
class FilterSnp(BaseModel):
    enabled: bool = False
    maf_cutoff: float = Field(default=0.05)

    @field_validator("maf_cutoff", mode="before")
    @classmethod
    def validate_maf_cutoff(cls, v):
        try:
            v = float(v)
            if 0.01 <= v <= 0.1:
                return v
        except:
            pass
        return 0.05


# -------------------------
# MULTI HIT FILTER
# -------------------------
class FilterMultiHit(BaseModel):
    enabled: bool = False

# -------------------------
# XY CHROMOSOMES FILTER
# -------------------------
class FilterXyChromosomes(BaseModel):
    enabled: bool = False

# -------------------------
# FILTER SAMPLE QUALITY FILTER
# -------------------------
class FilterSampleQuality(BaseModel):
    enabled: bool = False
    detection_p_cutoff: float = Field(default=0.01)
    sample_failure_rate: float = Field(default=0.10)
    remove_failed_samples: bool = Field(default=True)
    enable_pca_outlier_detection: bool = Field(default=True)

    @field_validator("detection_p_cutoff", mode="before")
    @classmethod
    def validate_detection_p_cutoff(cls, v):
        try:
            v = float(v)
            if 0.01 <= v <= 0.05:
                return v
        except:
            pass
        return 0.01

    @field_validator("sample_failure_rate", mode="before")
    @classmethod
    def validate_sample_failure_rate(cls, v):
        try:
            v = float(v)
            if 0.05 <= v <= 0.2:
                return v
        except:
            pass
        return 0.10

# -------------------------
# ROOT SETTINGS
# -------------------------
class FilterSettings(BaseModel):
    det_p:           FilterDetP           = Field(default_factory=FilterDetP)
    bead_count:      FilterBeadCount      = Field(default_factory=FilterBeadCount)
    non_cpg:         FilterNonCpg         = Field(default_factory=FilterNonCpg)
    snp:             FilterSnp            = Field(default_factory=FilterSnp)
    multi_hit:       FilterMultiHit       = Field(default_factory=FilterMultiHit)
    xy_chromosomes:  FilterXyChromosomes  = Field(default_factory=FilterXyChromosomes)
    sample_quality:  FilterSampleQuality  = Field(default_factory=FilterSampleQuality)