import pandas as pd
from pathlib import Path
from fastapi import HTTPException

JOBS_DIR = Path("/app/jobs")
MAX_PAGE_SIZE = 500 # Praktisches Limit, um Server- und Netzwerkbelastung zu steuern


def get_table_data(job_id: str, page: int, page_size: int) -> dict:
    """
    Liest die output.csv eines Jobs ein und gibt einen paginierten
    Ausschnitt mit Spaltenmetadaten zurück.

    Fehler:
        400 page_size überschreitet MAX_PAGE_SIZE
        404 Job-Verzeichnis nicht gefunden
        409 output.csv noch nicht vorhanden (Analyse läuft noch)
    """
    # Manuell validieren → 400 statt 422
    if page_size > MAX_PAGE_SIZE:
        raise HTTPException(status_code=400, detail={
            "error": "PAGE_SIZE_TOO_LARGE",
            "message": f"page_size darf maximal {MAX_PAGE_SIZE} sein"
        })

    job_dir = JOBS_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail={
            "error": "JOB_NOT_FOUND",
            "message": f"Job {job_id} nicht gefunden"
        })

    csv_path = job_dir / "output.csv"
    if not csv_path.exists():
        raise HTTPException(status_code=409, detail={
            "error": "DATA_NOT_READY",
            "message": "Analyse noch nicht abgeschlossen"
        })

    # Erste Spalte = cpg_id (Index)
    df = pd.read_csv(csv_path, index_col=0)
    df.index.name = "cpg_id"
    df = df.reset_index()

    # Spaltentypen für Frontend-Rendering ermitteln
    columns = []
    for col in df.columns:
        if pd.api.types.is_integer_dtype(df[col]):
            col_type = "integer"
        elif pd.api.types.is_float_dtype(df[col]):
            col_type = "float"
        else:
            col_type = "string"
        columns.append({"name": col, "type": col_type})

    total_rows = len(df)
    total_pages = max(1, -(-total_rows // page_size))  # ceiling division

    # Seitenausschnitt berechnen
    start = (page - 1) * page_size
    page_df = df.iloc[start:start + page_size]

    return {
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_rows": total_rows,
            "total_pages": total_pages
        },
        "columns": columns,
        "data": page_df.fillna("").to_dict(orient="records")
    }