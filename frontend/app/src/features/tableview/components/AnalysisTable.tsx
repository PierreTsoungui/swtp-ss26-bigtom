import { TablePagination } from "./TablePagination";

type Props = {
  data: any;
  sorting?: {
    sort_by: string | null;
    sort_order: "asc" | "desc" | null;
  };
  onSort?: (columnKey: string) => void;
  onPageChange?: (page: number) => void;
};

function SortIcon({ columnKey, sorting }: { columnKey: string; sorting: Props["sorting"] }) {
  const isActive = sorting?.sort_by === columnKey;
  
  if (!isActive) {
    return null;
  }
  
  if (sorting?.sort_order === "asc") {
    return <span className="text-primary ml-1.5 text-base">▲</span>;
  }
  
  if (sorting?.sort_order === "desc") {
    return <span className="text-primary ml-1.5 text-base">▼</span>;
  }
  
  return null;
}

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

export function AnalysisTable({ data, sorting, onSort,  onPageChange = () => {}  }: Props) {
  if (!data || !data.columns || !data.data) {
    return (
      <div className="text-center py-12 bg-neutral-background rounded-md border border-neutral-borderDefault">
        <p className="text-neutral-textSecondary">Keine Daten vorhanden.</p>
      </div>
    );
  }

  

  return (
    <div>
      {/* Tabelle */}
      <div className="overflow-auto border border-neutral-borderDefault rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-neutral-background border-b border-neutral-borderDefault">
            <tr>
              {data.columns.map((column: any) => (
                <th
                  key={column.key}
                  onClick={() => {
                    if (column.sortable && onSort) {
                      onSort(column.key);
                    }
                  }}
                  className={`
                    px-4 py-3 text-left text-xs font-medium text-neutral-textSecondary uppercase tracking-wider
                    ${column.sortable ? "cursor-pointer hover:bg-neutral-surface select-none" : ""}
                  `}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {column.sortable && (
                      <SortIcon columnKey={column.key} sorting={sorting} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.data.map((row: any, index: number) => (
              <tr key={index} className="hover:bg-neutral-background">
                {data.columns.map((column: any) => (
                  <td key={column.key} className="px-4 py-3 text-neutral-textSecondary">
                    {formatCellValue(row[column.key], column.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
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
