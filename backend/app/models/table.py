from pydantic import BaseModel
from typing import Any


class ColumnMeta(BaseModel):
    """
    Metadatenbeschreibung einer Tabellenspalte.

    Wird vom Frontend genutzt, um Tabellen dynamisch zu rendern
    (z. B. Typformatierung, Sortierung, Filterlogik).

    Erwartete Typen:
    - string
    - integer
    - float

    erweiterbar
    """

    name: str
    type: str


class Pagination(BaseModel):
    """
    Pagination-Metadaten für seitenweises Laden großer Tabellen.

    Die Werte beziehen sich immer auf den vollständigen Datensatz
    des jeweiligen Jobs, nicht nur auf die aktuell geladene Seite.
    """

    page: int
    page_size: int
    total_rows: int
    total_pages: int


class TableResponse(BaseModel):
    """
    Standardisierte API-Response für tabellarische Jobdaten.

    Beispiel:
    {
        "pagination": {
            "page": 1,
            "page_size": 100,
            "total_rows": 5421,
            "total_pages": 55
        },
        "columns": [
            {"name": "sample_id", "type": "string"},
            {"name": "score", "type": "float"}
        ],
        "data": [
            {
                "sample_id": "A001",
                "score": 0.91
            }
        ]
    }

    Hinweise:
    - `columns` definiert die stabile Tabellenstruktur.
    - `data` enthält die eigentlichen Zeilenwerte.
    - Die Response ist bewusst generisch gehalten, damit unterschiedliche
      Analyse-Pipelines dieselbe Tabellen-API verwenden können.
    """

    pagination: Pagination
    columns: list[ColumnMeta]
    data: list[dict[str, Any]]