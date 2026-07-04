import { TablePagination } from "./TablePagination";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TableSortLabel,
  Box,
} from "@mui/material";

/**
 * Props for the AnalysisTable component.
 */
interface AnalysisTableProps {
  /** The dataset containing row data, column definitions, and pagination metadata. */
  data: any;
  /** Current active sorting criteria. */
  sorting?: {
    sort_by: string | null;
    sort_order: "asc" | "desc" | null;
  };
  /** Callback fired when a sortable column header is clicked. */
  onSort?: (columnKey: string) => void;
  /** Callback fired when the active page changes. */
  onPageChange?: (page: number) => void;
}
/**
 * Formats raw cell values based on their data type.
 *
 * Special handling for 'float' types:
 * - Uses **exponential notation** for very small values (< 0.0001) to ensure scientific readability.
 * - Trims unnecessary trailing zeros for cleaner presentation.
 *
 * @param value - The raw value to format.
 * @param type - The expected data type (e.g., 'float', 'string').
 */
function formatCellValue(value: any, type: string): string {
  if (value === null || value === undefined) {
    return '—';
  }
  
  if (type === 'float') {
    if (typeof value === 'number') {
      if (Math.abs(value) < 0.0001 && value !== 0) {
        return value.toExponential(4);
      }
      const formatted = value.toFixed(4).replace(/\.?0+$/, '');
      return formatted || '0';
    }
    return String(value);
  }
  
  return String(value);
}

/**
 * A data table component optimized for displaying genomic analysis results (DMPs/DMRs).
 *
 * It supports dynamic column rendering, server-side sorting via {@link TableSortLabel},
 * and dual-position pagination for better navigation in long datasets.
 */
export function AnalysisTable({ data, sorting, onSort,  onPageChange = () => {}  }: AnalysisTableProps) {
  if (!data || !data.columns || !data.data) {
    return (
      <div className="text-center py-12 bg-neutral-background rounded-md border border-neutral-borderDefault">
        <p className="text-neutral-textSecondary">No data available.</p>
      </div>
    );
  }

  return (
    <div className={"space-y-4"}>
      {/* Pagination oben */}
      {data.pagination && data.pagination.total_pages > 1 && (
          <TablePagination
              page={data.pagination.page}
              totalPages={data.pagination.total_pages}
              pageSize={data.pagination.page_size}
              onPageChange={onPageChange}
          />
      )}
      {/* Tabelle */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Tabelle */}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "grey.50" }}>
                {data.columns.map((column: any) => (
                    <TableCell
                        key={column.key}
                        sortDirection={
                          sorting?.sort_by === column.key
                              ? sorting?.sort_order ?? false
                              : false
                        }
                        sx={{ fontWeight: 600, textTransform: "uppercase", fontSize: "0.75rem" }}
                    >
                      {column.sortable && onSort ? (
                          <TableSortLabel
                              active={sorting?.sort_by === column.key}
                              direction={
                                sorting?.sort_by === column.key
                                    ? (sorting?.sort_order ?? "asc")
                                    : "asc"
                              }
                              onClick={() => onSort(column.key)}
                          >
                            {column.label}
                          </TableSortLabel>
                      ) : (
                          column.label
                      )}
                    </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {data.data.map((row: any, index: number) => (
                  <TableRow
                      key={index}
                      hover
                      sx={{ "&:last-child td": { borderBottom: 0 } }}
                  >
                    {data.columns.map((column: any) => (
                        <TableCell key={column.key}>
                          {formatCellValue(row[column.key], column.type)}
                        </TableCell>
                    ))}
                  </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Pagination unten */}
      {data.pagination && data.pagination.total_pages > 1 && (
        <TablePagination
          page={data.pagination.page}
          totalPages={data.pagination.total_pages}
          pageSize={data.pagination.page_size}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}