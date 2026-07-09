"""Shared filtering for the DMP/DMR tables (and the heatmap CpG selection)."""

from typing import Any

import pandas as pd
from fastapi import HTTPException

from app.core.error_types import ErrorTypes, problem_detail


def normalize_filters(query_params: dict) -> dict:
    """Extract only the ``filter_*`` query parameters, stripping the prefix."""
    filters = {}

    for k, v in query_params.items():
        if k.startswith("filter_"):
            filters[k.replace("filter_", "")] = v

    return filters


def to_float(value: Any):
    """Parse ``value`` as a float, raising HTTP 400 on invalid input."""
    try:
        return float(value)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.INVALID_PARAMETER,
                detail=f"Invalid filter value: {value}",
                instance="/api/table",
            ),
        ) from None


# FILTER DEFINITIONS
#
# Operators (see apply_filters):
#   eq        exact string equality (e.g. DMR_ID: "DMR_421" must NOT match "DMR_4211")
#   ci_eq     case-insensitive equality — for categorical labels whose casing may
#             differ between the data and the UI (e.g. CGI "island" vs "Island")
#   chr_eq    chromosome equality, tolerant to a "chr" prefix AND case, so a table
#             value of "1"/"X" matches a filter of "chr1"/"chrX" and vice versa
#   contains  case-insensitive substring search
#   gte/lte, abs_gte/abs_lte, direction  numeric comparisons

FILTER_MAP = {
    "dmp": {
        "chr": ("CHR", "chr_eq"),  # "1" (data) must match "chr1" (UI)
        "start": ("POS", "gte"),
        "stop": ("POS", "lte"),
        "gene": ("GENE", "contains"),  # substring search (e.g. "HOX" → HOXA…)
        "feature": ("FEATURE", "ci_eq"),  # genomic region (TSS1500, Body, IGR, …)
        "cgi": ("CGI", "ci_eq"),  # CpG context ("island" data vs "Island" UI)
        "adj_p_value": ("ADJ_P", "lte"),
        "delta_beta": ("DELTA_BETA", "abs_gte"),  # magnitude |Δβ| ≥ x
        "delta_direction": ("DELTA_BETA", "direction"),  # hyper (Δβ>0) / hypo (Δβ<0)
        "group2_avg_min": ("GROUP2_AVG", "gte"),
        "group2_avg_max": ("GROUP2_AVG", "lte"),
        "group1_avg_min": ("GROUP1_AVG", "gte"),
        "group1_avg_max": ("GROUP1_AVG", "lte"),
        "log_fc_min": ("LOG_FC", "abs_gte"),
        "log_fc_max": ("LOG_FC", "abs_lte"),
        "dmr_id": ("DMR_ID", "eq"),  # exact: "DMR_421" must NOT match "DMR_4211"
    },
    "dmr": {
        "chr": ("CHR", "chr_eq"),  # same prefix/case tolerance as DMP
        "dmrid": ("ID", "eq"),  # exact DMR-ID match
        "start": ("START", "gte"),
        "stop": ("STOP", "lte"),
        "p_value": ("P_VALUE", "lte"),
        "mean_diff_min": ("MEANDIFF", "abs_gte"),
        "mean_diff_max": ("MEANDIFF", "abs_lte"),
        "width_min": ("WIDTH", "gte"),
        "width_max": ("WIDTH", "lte"),
        "n_dmps_min": ("N_DMPS", "gte"),
        "n_dmps_max": ("N_DMPS", "lte"),
    },
}


def _normalize_chr(value: Any) -> str:
    """Canonicalise a chromosome identifier for tolerant comparison.

    The analysis tables store the bare chromosome id ("1", "X"), matching the
    customer specification, while the UI dropdown offers the common "chr1"/"chrX"
    form. Stripping an optional leading "chr" and lower-casing makes both sides
    compare equal regardless of which convention the data or the filter uses.
    """
    s = str(value).strip().lower()
    return s[3:] if s.startswith("chr") else s


# APPLY FILTERS


def apply_filters(df: pd.DataFrame, table: str, filters: dict) -> pd.DataFrame:
    """Apply the table's filter map to a DataFrame and return the matching rows.

    Unknown tables and unknown filter keys are ignored, so an empty or partial
    filter set is always valid.
    """
    if table not in FILTER_MAP:
        return df

    mapping = FILTER_MAP[table]

    mask = pd.Series(True, index=df.index)

    for key, value in filters.items():

        if key not in mapping:
            raise HTTPException(
                status_code=400,
                detail=problem_detail(
                    error_type=ErrorTypes.INVALID_PARAMETER,
                    detail=f"Unknown filter: {key}",
                    instance="/api/table",
                ),
            )

        column, op = mapping[key]

        if column not in df.columns:
            continue

        if op == "eq":
            mask &= df[column].astype(str) == str(value)

        elif op == "ci_eq":
            # Case-insensitive equality for categorical labels (e.g. CGI: the data
            # stores "island" while the UI sends "Island").
            mask &= df[column].astype(str).str.strip().str.lower() == str(value).strip().lower()

        elif op == "chr_eq":
            # Chromosome equality, tolerant to a "chr" prefix and case so a table
            # value of "1"/"X" matches a filter of "chr1"/"chrX" (and vice versa).
            mask &= df[column].astype(str).map(_normalize_chr) == _normalize_chr(value)

        elif op == "contains":
            mask &= df[column].astype(str).str.contains(str(value), case=False, na=False)

        elif op == "gte":
            mask &= df[column] >= to_float(value)

        elif op == "lte":
            mask &= df[column] <= to_float(value)

        elif op == "abs_gte":
            mask &= df[column].abs() >= to_float(value)

        elif op == "abs_lte":
            mask &= df[column].abs() <= to_float(value)

        elif op == "direction":
            # Directional Δβ: hyper = stronger in case (Δβ > 0), hypo = weaker
            # (Δβ < 0). Any other value (e.g. "both") imposes no constraint.
            if value == "hyper":
                mask &= df[column] > 0
            elif value == "hypo":
                mask &= df[column] < 0

    return df[mask]
