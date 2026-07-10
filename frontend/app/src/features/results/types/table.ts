/**
 * Domain types for the paginated analysis result tables (DMP/DMR).
 */

/**
 * A single cell value in a result table. The backend serializes numeric metrics
 * as numbers, text/annotation columns as strings, and missing values as `null`.
 */
export type TableCellValue = string | number | null;

/**
 * Definition of one column in a result table.
 */
export type TableColumn = {
  /** Stable key used to read the value from a {@link TableRow}. */
  key: string;
  /** Human-readable column header. */
  label: string;
  /** Value type hint driving formatting (e.g. `"float"`, `"string"`). */
  type: string;
  /** Whether the column can be sorted server-side. */
  sortable?: boolean;
};

/**
 * A single result row, keyed by {@link TableColumn.key}.
 */
export type TableRow = Record<string, TableCellValue>;

/**
 * Pagination metadata returned alongside a page of table rows.
 */
export type PaginationMeta = {
  /** Current active page (1-indexed). */
  page: number;
  /** Number of rows per page. */
  page_size: number;
  /** Total number of pages available for the current filter. */
  total_pages: number;
  /** Total number of rows matching the current filter. */
  total_rows: number;
};

/**
 * A page of result-table data as returned by `GET /table/{job_id}/{table}`.
 */
export type TableData = {
  columns: TableColumn[];
  data: TableRow[];
  pagination: PaginationMeta;
};
