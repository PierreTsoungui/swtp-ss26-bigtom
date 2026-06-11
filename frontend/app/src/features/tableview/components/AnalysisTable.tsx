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
    return <span className="text-blue-600 ml-1.5 text-base">▲</span>;
  }
  
  if (sorting?.sort_order === "desc") {
    return <span className="text-blue-600 ml-1.5 text-base">▼</span>;
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
      <div className="text-center py-12 bg-slate-50 rounded-md border border-slate-200">
        <p className="text-slate-500">Keine Daten vorhanden.</p>
      </div>
    );
  }

  

  return (
    <div>
      {/* Tabelle */}
      <div className="overflow-auto border border-slate-200 rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
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
                    px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase tracking-wider
                    ${column.sortable ? "cursor-pointer hover:bg-slate-100 select-none" : ""}
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

              {/* Pagination */}
              {data.pagination && data.pagination.total_pages > 1 && (
                  <TablePagination
                      page={data.pagination.page}
                      totalPages={data.pagination.total_pages}
                      pageSize={data.pagination.page_size}
                      onPageChange={onPageChange}
                  />
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.data.map((row: any, index: number) => (
              <tr key={index} className="hover:bg-slate-50">
                {data.columns.map((column: any) => (
                  <td key={column.key} className="px-4 py-3 text-slate-700">
                    {formatCellValue(row[column.key], column.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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