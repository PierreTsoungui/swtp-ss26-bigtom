import pandas as pd
from pathlib import Path
from fastapi import HTTPException

JOBS_DIR = Path("/app/jobs")
#MAX_PAGE_SIZE = 500 # Praktisches Limit, um Server- und Netzwerkbelastung zu steuern
PAGE_SIZE = 75 # Datatensätze pro Seite 
def get_table_data(
    job_id: str,
    table: str,
    sort_by: str | None,
    sort_order: str | None,
    page: int,
) -> dict:
      
    """

    Liest die output.csv eines Jobs ein und gibt einen paginierten

    Ausschnitt mit Spaltenmetadaten zurück.



    Fehler:

        400 page_size überschreitet MAX_PAGE_SIZE

        404 Job-Verzeichnis nicht gefunden

        409 output.csv noch nicht vorhanden (Analyse läuft noch)

    """
      
   

    job_dir = JOBS_DIR / job_id

    if not job_dir.exists():
        raise HTTPException(
            status_code=404,
            detail={
                "error": "JOB_NOT_FOUND",
                "message": f"Job {job_id} nicht gefunden"
            }
        )

    csv_path = (
        job_dir / "dmr_results.csv"
        if table == "dmr"
        else job_dir / "dmp_results.csv"
    )

    if not csv_path.exists():
        raise HTTPException(
            status_code=409,
            detail={
                "error": "DATA_NOT_READY",
                "message": "Analyse noch nicht abgeschlossen"
            }
        )
    
    if(page < 1):
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_PAGE",
                "message": "Page-Nummer muss größer oder gleich 1 sein"
            }
        )

    df = pd.read_csv(csv_path, index_col=0)
    df.index.name = "cpg_id"
    df = df.reset_index()

    # stabile Standardsortierung
    df = df.sort_values("cpg_id")

    # Benutzersortierung
    if sort_by and sort_order:

        if sort_by not in df.columns:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "INVALID_SORT_COLUMN",
                    "message": f"Unbekannte Spalte: {sort_by}"
                }
            )
        if sort_order not in ["asc", "desc"]:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "INVALID_SORT_ORDER",
                    "message": f"Ungültige sort_order: {sort_order}"
                }
            )
        ascending = sort_order == "asc"

        df = df.sort_values(
            by=sort_by,
            ascending=ascending
        )

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