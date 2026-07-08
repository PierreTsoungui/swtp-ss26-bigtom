# app/api/routes/table.py
"""Routes for reading and exporting the paginated DMP/DMR result tables."""
from fastapi import APIRouter, Query, Request
from fastapi.responses import Response
from app.services.table_filter import normalize_filters
from app.services.table_handler import get_table_data, export_table_csv

router = APIRouter()


@router.get("/table/{job_id}/{table}")
def get_table(
    job_id: str,
    table: str,
    request: Request,
    sort_by: str | None = None,
    sort_order: str | None = None,
    page: int = Query(default=1, ge=1),
):
    """Return one paginated, filtered and sorted page of a result table."""
    filters = normalize_filters(dict(request.query_params))
    return get_table_data(
        job_id=job_id,
        page=page,
        table=table,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters,
    )


@router.get("/table/{job_id}/{table}/export")
def export_table(
    job_id: str,
    table: str,
    request: Request,
    sort_by: str | None = None,
    sort_order: str | None = None,
):
    """Export the filtered, sorted result table as a downloadable CSV file."""
    filters     = normalize_filters(dict(request.query_params))
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
        headers={"Content-Disposition": f'attachment; filename="{table}_{job_id}_export.csv"'},
    )