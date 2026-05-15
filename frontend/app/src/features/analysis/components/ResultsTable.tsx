import type {
  ResultsTableCellValue,
  ResultsTableResponse,
  ResultsTableSorting,
} from "../utils/types";

interface ResultsTableProps {
  data: ResultsTableResponse;
  sorting: ResultsTableSorting | null;
  onSortingChange: (sorting: ResultsTableSorting) => void;
}

const numberFormatter = new Intl.NumberFormat("de-DE");

export function ResultsTable({
  data,
  sorting,
  onSortingChange,
}: ResultsTableProps) {
  const visibleRows = data.rows.slice(0, 100);

  return (
    <section
      className="w-full max-w-7xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="results-table-title"
    >
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="results-table-title" className="text-2xl font-semibold text-slate-900">
            Ergebnistabelle
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Zeige {visibleRows.length} von {numberFormatter.format(data.total_rows)} Zeilen.
          </p>
        </div>
        <p className="text-sm text-slate-500">
          Seite {data.page}, {data.page_size} Zeilen pro Seite
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Normalisierte Analyseergebnisse mit dynamischen Spalten
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
              {data.columns.map((column) => {
                const activeOrder =
                  sorting?.column === column ? sorting.order : undefined;

                return (
                  <th
                    key={column}
                    scope="col"
                    aria-sort={toAriaSort(activeOrder)}
                    className="whitespace-nowrap px-4 py-3 font-semibold"
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-sm text-left font-semibold text-slate-700 hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                      onClick={() => onSortingChange(getNextSorting(column, sorting))}
                    >
                      <span>{column}</span>
                      <span
                        aria-hidden="true"
                        className={
                          activeOrder
                            ? "text-slate-900"
                            : "text-slate-400"
                        }
                      >
                        {activeOrder === "asc" ? "▲" : activeOrder === "desc" ? "▼" : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr
                key={getRowKey(row, rowIndex)}
                className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
              >
                {data.columns.map((column) => (
                  <td
                    key={`${rowIndex}-${column}`}
                    className="whitespace-nowrap px-4 py-3 text-slate-700"
                  >
                    {formatCellValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getNextSorting(
  column: string,
  currentSorting: ResultsTableSorting | null
): ResultsTableSorting {
  if (currentSorting?.column === column && currentSorting.order === "asc") {
    return { column, order: "desc" };
  }

  return { column, order: "asc" };
}

function toAriaSort(
  order: ResultsTableSorting["order"] | undefined
): "ascending" | "descending" | "none" {
  if (order === "asc") return "ascending";
  if (order === "desc") return "descending";
  return "none";
}

function formatCellValue(value: ResultsTableCellValue | undefined): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "number") return numberFormatter.format(value);
  return value;
}

function getRowKey(
  row: Record<string, ResultsTableCellValue>,
  rowIndex: number
): string {
  const firstValue = Object.values(row).find(
    (value) => value !== null && value !== ""
  );

  return `${rowIndex}-${String(firstValue ?? "empty")}`;
}
