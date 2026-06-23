# app/models/filter.py
"""Request models for the filtering step.

These mirror the filter options the frontend offers. Every numeric field clamps
out-of-range or non-numeric input back to a safe default via a validator, so a
malformed request can never push an invalid cutoff into the R filter script.
"""
from pydantic import BaseModel, Field, field_validator


class FilterDetP(BaseModel):
    """Detection p-value filter."""
    enabled: bool = False
    cutoff:  float = Field(default=0.01)

    @field_validator("cutoff", mode="before")
    @classmethod
    def validate_cutoff(cls, v):
        # Accept values in [0.01, 0.05]; otherwise fall back to the default.
        try:
            v = float(v)
            if 0.01 <= v <= 0.05:
                return v
        except (TypeError, ValueError):
            pass
        return 0.01


class FilterBeadCount(BaseModel):
    """Bead-count filter."""
    enabled:     bool = False
    bead_cutoff: float = Field(default=0.05)

    @field_validator("bead_cutoff", mode="before")
    @classmethod
    def validate_bead_cutoff(cls, v):
        try:
            v = float(v)
            if 0.01 <= v <= 0.1:
                return v
        except (TypeError, ValueError):
            pass
        return 0.05


class FilterNonCpg(BaseModel):
    """Remove non-CpG probes."""
    enabled: bool = False


class FilterSnp(BaseModel):
    """SNP-overlap filter."""
    enabled:    bool = False
    maf_cutoff: float = Field(default=0.05)

    @field_validator("maf_cutoff", mode="before")
    @classmethod
    def validate_maf_cutoff(cls, v):
        try:
            v = float(v)
            if 0.01 <= v <= 0.1:
                return v
        except (TypeError, ValueError):
            pass
        return 0.05


class FilterMultiHit(BaseModel):
    """Remove cross-reactive (multi-hit) probes."""
    enabled: bool = False


class FilterXyChromosomes(BaseModel):
    """Remove probes on the X/Y chromosomes."""
    enabled: bool = False


class FilterSampleQuality(BaseModel):
    """Sample-level quality control (detection p-value, failure rate, PCA outliers)."""
    enabled:                      bool = False
    detection_p_cutoff:           float = Field(default=0.01)
    sample_failure_rate:          float = Field(default=0.10)
    remove_failed_samples:        bool = Field(default=True)
    enable_pca_outlier_detection: bool = Field(default=True)

    @field_validator("detection_p_cutoff", mode="before")
    @classmethod
    def validate_detection_p_cutoff(cls, v):
        try:
            v = float(v)
            if 0.01 <= v <= 0.05:
                return v
        except (TypeError, ValueError):
            pass
        return 0.01

    @field_validator("sample_failure_rate", mode="before")
    @classmethod
    def validate_sample_failure_rate(cls, v):
        try:
            v = float(v)
            if 0.05 <= v <= 0.2:
                return v
        except (TypeError, ValueError):
            pass
        return 0.10


class FilterSettings(BaseModel):
    """Root container holding every individual filter. Each sub-filter defaults
    to a disabled, safe configuration so an empty request is always valid."""
    det_p:          FilterDetP          = Field(default_factory=FilterDetP)
    bead_count:     FilterBeadCount     = Field(default_factory=FilterBeadCount)
    non_cpg:        FilterNonCpg        = Field(default_factory=FilterNonCpg)
    snp:            FilterSnp           = Field(default_factory=FilterSnp)
    multi_hit:      FilterMultiHit      = Field(default_factory=FilterMultiHit)
    xy_chromosomes: FilterXyChromosomes = Field(default_factory=FilterXyChromosomes)
    sample_quality: FilterSampleQuality = Field(default_factory=FilterSampleQuality)
