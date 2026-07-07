"""Pydantic schemas for the generic, paginated table API."""
from pydantic import BaseModel
from typing import Any


class ColumnMeta(BaseModel):
    """Metadata for one table column.

    Used by the frontend to render tables dynamically (type formatting, sorting,
    filter logic). Expected types are ``string``, ``integer`` and ``float``
    (extensible).
    """

    name: str
    type: str


class Pagination(BaseModel):
    """Pagination metadata for paging through large tables.

    The values always refer to the full dataset of the given job, not only the
    currently loaded page.
    """

    page: int
    page_size: int
    total_rows: int
    total_pages: int


class TableResponse(BaseModel):
    """Standardized API response for tabular job data.

    ``columns`` defines the stable table structure and ``data`` holds the actual
    row values. The response is intentionally generic so different analysis
    pipelines can reuse the same table API.
    """

    pagination: Pagination
    columns: list[ColumnMeta]
    data: list[dict[str, Any]]