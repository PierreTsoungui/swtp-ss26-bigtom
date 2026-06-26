import pandas as pd
from fastapi import HTTPException
from typing import Any

from app.core.error_types import ErrorTypes, problem_detail

def normalize_filters(query_params: dict) -> dict:
    """
    Extrahiert nur filter_* Parameter aus request.query_params
    """
    filters = {}

    for k, v in query_params.items():
        if k.startswith("filter_"):
            filters[k.replace("filter_", "")] = v

    return filters


def to_float(value: Any):
    try:
        return float(value)
    except (TypeError, ValueError):
      raise HTTPException(
            status_code=400,
            detail=problem_detail(
                error_type=ErrorTypes.INVALID_PARAMETER,
                detail=f"Invalid filter value: {value}",
                instance="/api/table",
            )
        )
    

# FILTER DEFINITIONS

FILTER_MAP = {
    "dmp": {
        "chr": ("CHR", "eq"),
        "start": ("POS", "gte"),
        "stop": ("POS", "lte"),
        "gene": ("GENE", "contains"),       # substring search (e.g. "HOX" → HOXA…)
        "feature": ("FEATURE", "eq"),       # genomic region (TSS1500, Body, IGR, …)
        "cgi": ("CGI", "eq"),               # CpG context (Island, Shore, Shelf, OpenSea)
        "adj_p_value": ("ADJ_P", "lte"),
        "delta_beta": ("DELTA_BETA", "abs_gte"),       # magnitude |Δβ| ≥ x
        "delta_direction": ("DELTA_BETA", "direction"),  # hyper (Δβ>0) / hypo (Δβ<0)
        "group2_avg_min": ("GROUP2_AVG", "gte"),
        "group2_avg_max": ("GROUP2_AVG", "lte"),
        "group1_avg_min": ("GROUP1_AVG", "gte"),
        "group1_avg_max": ("GROUP1_AVG", "lte"),
        "log_fc_min": ("LOG_FC", "abs_gte"),
        "log_fc_max": ("LOG_FC", "abs_lte"),
        "dmr_id": ("DMR_ID", "eq"),         # exact: "DMR_421" must NOT match "DMR_4211"
    },
    "dmr": {
        "chr": ("CHR", "eq"),
        "dmrid": ("ID", "eq"),              # exact DMR-ID match
        "start": ("START", "gte"),
        "stop": ("STOP", "lte"),
        "p_value": ("P_VALUE", "lte"),
        "mean_diff_min": ("MEANDIFF", "abs_gte"),
        "mean_diff_max": ("MEANDIFF", "abs_lte"),
        "width_min": ("WIDTH", "gte"),
        "width_max": ("WIDTH", "lte"),
        "n_dmps_min": ("N_DMPS", "gte"),
        "n_dmps_max": ("N_DMPS", "lte"),
    }
}


# APPLY FILTERS 

def apply_filters(df: pd.DataFrame, table: str, filters: dict) -> pd.DataFrame:

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
            )
          )

        column, op = mapping[key]

        if column not in df.columns:
            continue

        if op == "eq":
            mask &= df[column].astype(str) == str(value)

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

