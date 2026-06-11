from pathlib import Path
import pandas as pd
from fastapi import HTTPException
from io import StringIO
from app.services.table_filter import apply_filters

JOBS_DIR = Path("/app/jobs")
#MAX_PAGE_SIZE = 500 # Praktisches Limit, um Server- und Netzwerkbelastung zu steuern
PAGE_SIZE = 75 # Datatensätze pro Seite


def load_dataframe(job_id: str, table: str) -> pd.DataFrame:
    
    print("JOBS_DIR =", JOBS_DIR)
    print("JOB_DIR =", JOBS_DIR / job_id)
    job_dir = JOBS_DIR / job_id

    if not job_dir.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "error": "JOB_NOT_FOUND",
                "message": f"Job {job_id} nicht gefunden"
            }
        )

    csv_path = job_dir / ("dmr_results.csv" if table == "dmr" else "dmp_results.csv")

    if not csv_path.exists():
        raise HTTPException(
            status_code=409,
            detail={
                "error": "DATA_NOT_READY",
                "message": "Analyse noch nicht abgeschlossen"
            }
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
                detail={
                    "error": "INVALID_SORT_COLUMN",
                    "message": f"Unbekannte Spalte: {sort_by}"
                }
            )

        if sort_order not in ("asc", "desc", None):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "INVALID_SORT_ORDER",
                    "message": f"Ungültige sort_order: {sort_order}"
                }
            )

        df = df.sort_values(
            by=sort_by,
            ascending=(sort_order != "desc")
        )

    elif "cpg_id" in df.columns:
        df = df.sort_values("cpg_id")

    return df


# UI TABLE (PAGINATED)

def get_table_data(
    job_id: str,
    table: str,
    page: int,
    sort_by: str | None,
    sort_order: str | None,
    filters: dict,
) -> dict:
    """

    Liest die output.csv eines Jobs ein und gibt einen paginierten

    Ausschnitt mit Spaltenmetadaten zurück.



    Fehler:

        400 page_size überschreitet MAX_PAGE_SIZE

        404 Job-Verzeichnis nicht gefunden

        409 output.csv noch nicht vorhanden (Analyse läuft noch)

    """

    df = build_dataframe(
        job_id,
        table,
        sort_by,
        sort_order,
        filters
    )

    total_rows = len(df)
    total_pages = max(1, -(-total_rows // PAGE_SIZE))

    start = (page - 1) * PAGE_SIZE
    page_df = df.iloc[start:start + PAGE_SIZE]

    columns = [
        {
            "key": col,
            "label": col,
            "type": str(df[col].dtype),
            "sortable": True,
            "filterable": True
        }
        for col in df.columns
    ]

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


# EXPORT (FULL DATASET!)


def export_table_csv(
    job_id: str,
    table: str,
    sort_by: str | None,
    sort_order: str | None,
    filters: dict,
) -> str:

    df =  build_dataframe(
        job_id,
        table,
        sort_by,
        sort_order,
        filters
    )

    output = StringIO()
    df.to_csv(output, index=False)
    return output.getvalue()


# import pandas as pd
# from io import StringIO
# from pathlib import Path
# from fastapi import HTTPException

# JOBS_DIR = Path("/app/jobs")
# PAGE_SIZE = 75


# def build_dataframe(
#     job_id: str,
#     table: str,
#     sort_by: str | None,
#     sort_order: str | None,
#     filter_chr: str | None = None,
#     filter_start: int | None = None,
#     filter_stop: int | None = None,
#     filter_dmr: str | None = None,
#     filter_p_value: float | None = None,
#     filter_adj_p_value: float | None = None,
# ) -> pd.DataFrame:

#     job_dir = JOBS_DIR / job_id

#     if not job_dir.exists():
#         raise HTTPException(
#             status_code=404,
#             detail={
#                 "error": "JOB_NOT_FOUND",
#                 "message": f"Job {job_id} nicht gefunden"
#             }
#         )

#     csv_path = (
#         job_dir / "dmr_results.csv"
#         if table == "dmr"
#         else job_dir / "dmp_results.csv"
#     )

#     if not csv_path.exists():
#         raise HTTPException(
#             status_code=409,
#             detail={
#                 "error": "DATA_NOT_READY",
#                 "message": "Analyse noch nicht abgeschlossen"
#             }
#         )

#     df = pd.read_csv(csv_path, index_col=0)

#     df.index.name = "cpg_id"
#     df = df.reset_index()

#     # Standardsortierung
#     df = df.sort_values("cpg_id")

#     # ------------------
#     # FILTER
#     # ------------------

#     if filter_chr and "chr" in df.columns:
#         df = df[df["chr"].astype(str) == str(filter_chr)]

#     if filter_start and "start" in df.columns:
#         df = df[df["start"] >= filter_start]

#     if filter_stop and "stop" in df.columns:
#         df = df[df["stop"] <= filter_stop]

#     if filter_dmr and "dmr_id" in df.columns:
#         df = df[
#             df["dmr_id"]
#             .astype(str)
#             .str.contains(filter_dmr, case=False, na=False)
#         ]

#     if filter_p_value and "p_value" in df.columns:
#         df = df[df["p_value"] <= filter_p_value]

#     if (
#         filter_adj_p_value
#         and "adj_p_value" in df.columns
#     ):
#         df = df[
#             df["adj_p_value"]
#             <= filter_adj_p_value
#         ]

#     # ------------------
#     # SORTIERUNG
#     # ------------------

#     if sort_by and sort_order:

#         if sort_by not in df.columns:
#             raise HTTPException(
#                 status_code=400,
#                 detail={
#                     "error": "INVALID_SORT_COLUMN",
#                     "message": f"Unbekannte Spalte: {sort_by}"
#                 }
#             )

#         if sort_order not in ["asc", "desc"]:
#             raise HTTPException(
#                 status_code=400,
#                 detail={
#                     "error": "INVALID_SORT_ORDER",
#                     "message": f"Ungültige sort_order: {sort_order}"
#                 }
#             )

#         df = df.sort_values(
#             by=sort_by,
#             ascending=(sort_order == "asc")
#         )

#     return df


# def get_table_data(
#     job_id: str,
#     table: str,
#     sort_by: str | None,
#     sort_order: str | None,
#     page: int,
#     filter_chr: str | None = None,
#     filter_start: int | None = None,
#     filter_stop: int | None = None,
#     filter_dmr: str | None = None,
#     filter_p_value: float | None = None,
#     filter_adj_p_value: float | None = None,
# ) -> dict:

#     if page < 1:
#         raise HTTPException(
#             status_code=400,
#             detail={
#                 "error": "INVALID_PAGE",
#                 "message": "Page muss >= 1 sein"
#             }
#         )

#     df = build_dataframe(
#         job_id=job_id,
#         table=table,
#         sort_by=sort_by,
#         sort_order=sort_order,
#         filter_chr=filter_chr,
#         filter_start=filter_start,
#         filter_stop=filter_stop,
#         filter_dmr=filter_dmr,
#         filter_p_value=filter_p_value,
#         filter_adj_p_value=filter_adj_p_value,
#     )

#     columns = []

#     for col in df.columns:

#         if pd.api.types.is_integer_dtype(df[col]):
#             col_type = "integer"
#         elif pd.api.types.is_float_dtype(df[col]):
#             col_type = "float"
#         else:
#             col_type = "string"

#         columns.append({
#             "key": col,
#             "label": col,
#             "type": col_type,
#             "sortable": True,
#             "filterable": True
#         })

#     total_rows = len(df)

#     total_pages = max(
#         1,
#         -(-total_rows // PAGE_SIZE)
#     )

#     start = (page - 1) * PAGE_SIZE

#     page_df = df.iloc[
#         start:start + PAGE_SIZE
#     ]

#     return {
#         "table": table,
#         "table_title": table.upper(),
#         "columns": columns,
#         "pagination": {
#             "page": page,
#             "page_size": PAGE_SIZE,
#             "total_rows": total_rows,
#             "total_pages": total_pages
#         },
#         "data": page_df.fillna("").to_dict(
#             orient="records"
#         )
#     }


# def export_table_csv(
#     job_id: str,
#     table: str,
#     sort_by: str | None,
#     sort_order: str | None,
#     filter_chr: str | None = None,
#     filter_start: int | None = None,
#     filter_stop: int | None = None,
#     filter_dmr: str | None = None,
#     filter_p_value: float | None = None,
#     filter_adj_p_value: float | None = None,
# ) -> str:

#     # KEINE Pagination
#     df = build_dataframe(
#         job_id=job_id,
#         table=table,
#         sort_by=sort_by,
#         sort_order=sort_order,
#         filter_chr=filter_chr,
#         filter_start=filter_start,
#         filter_stop=filter_stop,
#         filter_dmr=filter_dmr,
#         filter_p_value=filter_p_value,
#         filter_adj_p_value=filter_adj_p_value,
#     )

#     output = StringIO()

#     df.to_csv(
#         output,
#         index=False
#     )

#     return output.getvalue()