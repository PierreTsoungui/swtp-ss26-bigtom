
from pathlib import Path

import pandas as pd
from app.services.table_filter import apply_filters, to_float
from fastapi import HTTPException

from app.core.error_types import ErrorTypes, problem_detail


JOBS_DIR = Path("/app/jobs")
PAGE_SIZE = 75




def get_table_data(
    job_id: str,
    table: str,
    page: int,
    sort_by: str | None,
    sort_order: str | None,
    filters: dict,

) -> dict:

    job_dir = JOBS_DIR / job_id

    if not job_dir.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "JOB_NOT_FOUND", "message": f"Job {job_id} nicht gefunden"}
        )
    if table not in ("dmp", "dmr"):
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_TABLE", "message": f"Ungültige Tabelle: {table}"}
        )
    csv_path = job_dir / ("dmr_results.csv" if table == "dmr" else "dmp_results.csv")

    if not csv_path.exists():
        raise HTTPException(
            status_code=409,
            detail={"error": "DATA_NOT_READY", "message": "Analyse noch nicht abgeschlossen"}
        )

    if page < 1:
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_PAGE", "message": "Page muss >= 1 sein"}
        )

    df = pd.read_csv(csv_path)

    
    # FILTER
   
    df = apply_filters(df, table, filters)

   
    # SORTING
   
    if sort_by:
        if sort_by not in df.columns:
            raise HTTPException(
                status_code=400,
                detail=problem_detail(
                    error_type=ErrorTypes.INVALID_SORT_COLUMN,
                    detail=f"Invalid sort column: {sort_by}",
                    instance="/api/table",
                )
            )
        if sort_order not in ("asc", "desc"):
            raise HTTPException(
                status_code=400,
                detail=problem_detail(
                    error_type=ErrorTypes.INVALID_SORT_ORDER,
                    detail=f"Invalid sort order: {sort_order}",
                    instance="/api/table",
                )
            )

        ascending = sort_order == "asc"
        df = df.sort_values(by=sort_by, ascending=ascending)

    else:
        df = df.sort_values("ID")

   
    # COLUMN METADATA
   
    columns = []
    for col in df.columns:

        if pd.api.types.is_integer_dtype(df[col]):
            col_type = "integer"
        elif pd.api.types.is_float_dtype(df[col]):
            col_type = "float"
        else:
            col_type = "string"

        columns.append({
            "key": col,
            "label": col,
            "type": col_type,
            "sortable": True,
            "filterable": True
        })

   
    # PAGINATION
  
    total_rows = len(df)
    total_pages = max(1, -(-total_rows // PAGE_SIZE))

    start = (page - 1) * PAGE_SIZE
    page_df = df.iloc[start:start + PAGE_SIZE]

    return {
        "table": table,
        "table_title": table.upper(),
        "columns": columns,
        "pagination": {
            "page": page,
            "page_size": PAGE_SIZE,
            "total_rows": total_rows,
            "total_pages": total_pages
        },
        "data": page_df.fillna("").to_dict(orient="records")
    }