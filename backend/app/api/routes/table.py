from fastapi import APIRouter, Query, Request
from fastapi.responses import Response
from app.services.table_handler import (get_table_data, export_table_csv)
from app.services.table_filter import normalize_filters

router = APIRouter()

# TABLE (PAGINATED)

@router.get("/table/{job_id}/{table}")
def get_table(
    job_id: str,
    table: str,
    request: Request,
    sort_by: str | None = None,
    sort_order: str | None = None,
    page: int = Query(default=1, ge=1),
):

    filters = normalize_filters(dict(request.query_params))
    
    """
    Liefert paginierte Tabellendaten eines Analysejobs.

    TODO: Zukünftig können hier weitere Query-Parameter ergänzt werden, z. B.:
    - sort_by: str | None = None
    - sort_order: str = "asc"
    - chromosome: str | None = None
    - filter_by: str | None = None

    Der Endpoint dient primär zur Darstellung großer Ergebnisdatensätze
    im Frontend, ohne komplette CSV-/Matrixdaten auf einmal übertragen
    zu müssen.

    Parameter:
    - job_id:
        Eindeutige Job-ID des Analyseergebnisses.

    - page:
        1-basierte Seitennummer.

    - page_size:
        Anzahl Datensätze pro Seite.

        Es existiert kein hartes `le`-Limit auf API-Ebene,
        da Begrenzung zentral im Service-Layer erfolgt.
        => Limits konsistent an einer Stelle konfigurierbar

    Rückgabe:
    - TableResponse
        Strukturierte Tabellenrepräsentation inklusive Pagination-
        und Spaltenmetadaten.
    """

    return get_table_data(
        job_id=job_id,
        table=table,
        page=page,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters,
    )


# EXPORT (FULL CSV)

@router.get("/table/{job_id}/{table}/export")
def export_table(
    job_id: str,
    table: str,
    request: Request,
    sort_by: str | None = None,
    sort_order: str | None = None,
):

    filters = normalize_filters(dict(request.query_params))

    csv_content = export_table_csv(
        job_id=job_id,
        table=table,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters,
    )

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{table}_{job_id}_export.csv"'
        }
    )
