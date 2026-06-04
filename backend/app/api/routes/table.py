from fastapi import APIRouter, Query
from app.services.table_handler import get_table_data

router = APIRouter()


@router.get("/table/{job_id}/{table}")
def get_table(
    job_id: str,
    table: str,
    sort_by: str | None = None,
    sort_order: str | None = None,
    page: int = Query(default=1, ge=1),
):
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
        page=page,
        table=table,
        sort_by=sort_by,
        sort_order=sort_order
    )