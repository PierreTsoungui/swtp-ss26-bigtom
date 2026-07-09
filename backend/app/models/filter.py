# app/models/filter.py
"""Request models for the filtering step.

Every numeric field validates its value against a documented, spec-aligned range
(see Lastenheft FLT-06). A value outside the range raises a ValidationError that
the route layer maps to HTTP 400. There are no silent defaults for out-of-range
input — an invalid parameter always produces an error, never a quiet substitution.
"""
from pydantic import BaseModel, Field, field_validator


class FilterDetP(BaseModel):
    """Detection p-value filter."""

    enabled: bool = False
    cutoff:  float = Field(default=0.01)

    @field_validator("cutoff", mode="before")
    @classmethod
    def validate_cutoff(cls, v):
        """Reject cutoff values outside [0.01, 0.05]."""
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError("cutoff must be a number")
        if not (0.01 <= v <= 0.05):
            raise ValueError(f"cutoff must be between 0.01 and 0.05, got {v}")
        return v


class FilterBeadCount(BaseModel):
    """Bead-count filter."""

    enabled:     bool = False
    bead_cutoff: float = Field(default=0.05)

    @field_validator("bead_cutoff", mode="before")
    @classmethod
    def validate_bead_cutoff(cls, v):
        """Reject bead_cutoff values outside [0.0, 1.0]."""
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError("bead_cutoff must be a number")
        if not (0.0 <= v <= 1.0):
            raise ValueError(f"bead_cutoff must be between 0.0 and 1.0, got {v}")
        return v


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
        """Reject maf_cutoff values outside [0.0, 0.5]."""
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError("maf_cutoff must be a number")
        if not (0.0 <= v <= 0.5):
            raise ValueError(f"maf_cutoff must be between 0.0 and 0.5, got {v}")
        return v


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
        """Reject detection_p_cutoff values outside [0.01, 0.05]."""
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError("detection_p_cutoff must be a number")
        if not (0.01 <= v <= 0.05):
            raise ValueError(f"detection_p_cutoff must be between 0.01 and 0.05, got {v}")
        return v

    @field_validator("sample_failure_rate", mode="before")
    @classmethod
    def validate_sample_failure_rate(cls, v):
        """Reject sample_failure_rate values outside [0.05, 0.2]."""
        try:
            v = float(v)
        except (TypeError, ValueError):
            raise ValueError("sample_failure_rate must be a number")
        if not (0.05 <= v <= 0.2):
            raise ValueError(f"sample_failure_rate must be between 0.05 and 0.2, got {v}")
        return v


class FilterSettings(BaseModel):
    """Root container holding every individual filter.

    Each sub-filter defaults to a disabled, safe configuration so an empty
    request is always valid.
    """

    det_p:          FilterDetP          = Field(default_factory=FilterDetP)
    bead_count:     FilterBeadCount     = Field(default_factory=FilterBeadCount)
    non_cpg:        FilterNonCpg        = Field(default_factory=FilterNonCpg)
    snp:            FilterSnp           = Field(default_factory=FilterSnp)
    multi_hit:      FilterMultiHit      = Field(default_factory=FilterMultiHit)
    xy_chromosomes: FilterXyChromosomes = Field(default_factory=FilterXyChromosomes)
    sample_quality: FilterSampleQuality = Field(default_factory=FilterSampleQuality)
