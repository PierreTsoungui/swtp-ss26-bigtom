from pathlib import Path
import pandas as pd
from fastapi import HTTPException
from io import StringIO
from app.services.table_filter import apply_filters
from app.core.error_types import ErrorTypes, problem_detail

JOBS_DIR = Path("/app/jobs")
PAGE_SIZE = 75


def load_dataframe(job_id: str, table: str) -> pd.DataFrame:
    job_dir = JOBS_DIR / job_id

    if not job_dir.exists():
        raise HTTPException(
            status_code=404,
            detail={"error": "JOB_NOT_FOUND", "message": f"Job {job_id} nicht gefunden"}
        )

    # ← aus Links: Tabellen-Validierung
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

    return pd.read_csv(csv_path)


def build_dataframe(
    job_id: str,
    table: str,
    sort_by: str | None,
    sort_order: str | None,
    filters: dict | None = None,
) -> pd.DataFrame:

    df = load_dataframe(job_id, table)

    if filters:
        df = apply_filters(df, table, filters)

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
        if sort_order not in ("asc", "desc", None):
            raise HTTPException(
                status_code=400,
                detail=problem_detail(
                    error_type=ErrorTypes.INVALID_SORT_ORDER,
                    detail=f"Ungültige sort_order: {sort_order}",
                    instance="/api/table",
                )
            )
        df = df.sort_values(by=sort_by, ascending=(sort_order != "desc"))

    elif "cpg_id" in df.columns:
        df = df.sort_values("cpg_id")

    return df


def _build_columns(df: pd.DataFrame) -> list:
    """← aus Links: Frontend-freundliche Typnamen statt pandas-interne"""
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
            "filterable": True,
        })
    return columns


def get_table_data(
    job_id: str,
    table: str,
    page: int,
    sort_by: str | None,
    sort_order: str | None,
    filters: dict,
) -> dict:

    # ← aus Links: Page-Validierung
    if page < 1:
        raise HTTPException(
            status_code=400,
            detail={"error": "INVALID_PAGE", "message": "Page muss >= 1 sein"}
        )

    df = build_dataframe(job_id, table, sort_by, sort_order, filters)

    total_rows = len(df)
    total_pages = max(1, -(-total_rows // PAGE_SIZE))
    start = (page - 1) * PAGE_SIZE
    page_df = df.iloc[start:start + PAGE_SIZE]

    return {
        "table": table,
        "table_title": table.upper(),
        "columns": _build_columns(df),  # ← aus Links
        "pagination": {
            "page": page,
            "page_size": PAGE_SIZE,
            "total_rows": total_rows,
            "total_pages": total_pages,
        },
        "data": page_df.fillna("").to_dict(orient="records"),
    }


def export_table_csv(
    job_id: str,
    table: str,
    sort_by: str | None,
    sort_order: str | None,
    filters: dict,
) -> str:
    df = build_dataframe(job_id, table, sort_by, sort_order, filters)
    output = StringIO()
    df.to_csv(output, index=False)
    return output.getvalue()

