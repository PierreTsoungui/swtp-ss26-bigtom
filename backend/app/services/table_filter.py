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