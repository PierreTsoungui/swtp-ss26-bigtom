import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { resultsTableMock } from "../mocks/resultsTableMock";
import type {
  JobStatusValue,
  ResultsTableCellValue,
  ResultsTableResponse,
  ResultsTableSorting,
} from "../utils/types";

interface UseResultsTableResult {
  data: ResultsTableResponse | null;
  isLoading: boolean;
  error: string | null;
  sorting: ResultsTableSorting | null;
  setSorting: Dispatch<SetStateAction<ResultsTableSorting | null>>;
}

const PAGE = 1;
const PAGE_SIZE = 100;
const INVALID_RESPONSE_MESSAGE =
  "Die Ergebnistabelle konnte nicht verarbeitet werden.";

export function useResultsTable(
  jobId: string | null,
  status: JobStatusValue | null | undefined
): UseResultsTableResult {
  const [data, setData] = useState<ResultsTableResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<ResultsTableSorting | null>(null);
  const shouldLoad = status === "normalization_done" && Boolean(jobId);

  useEffect(() => {
    if (!shouldLoad || !jobId) return;

    const controller = new AbortController();
    const requestedJobId = jobId;

    async function loadResultsTable() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(buildResultsTableUrl(requestedJobId, sorting), {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API-Fehler (${response.status})`);
        }

        const body: unknown = await response.json();
        const parsed = parseResultsTableResponse(body);
        setData(parsed);
      } catch (caughtError) {
        if (controller.signal.aborted) return;

        if (shouldUseMockFallback()) {
          setData(resultsTableMock);
          setError(null);
          return;
        }

        setData(null);
        setError(toErrorMessage(caughtError));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadResultsTable();

    return () => controller.abort();
  }, [jobId, shouldLoad, sorting]);

  return {
    data: shouldLoad ? data : null,
    isLoading: shouldLoad ? isLoading : false,
    error: shouldLoad ? error : null,
    sorting,
    setSorting,
  };
}

export function parseResultsTableResponse(value: unknown): ResultsTableResponse {
  if (!isRecord(value)) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const { columns, rows, page, page_size, total_rows } = value;

  if (
    !isColumns(columns) ||
    !Array.isArray(rows) ||
    !rows.every(isResultRow) ||
    !isPositiveInteger(page) ||
    !isPositiveInteger(page_size) ||
    !isNonNegativeInteger(total_rows)
  ) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  return {
    columns,
    rows,
    page,
    page_size,
    total_rows,
  };
}

function buildResultsTableUrl(
  jobId: string,
  sorting: ResultsTableSorting | null
): string {
  const params = new URLSearchParams({
    page: String(PAGE),
    page_size: String(PAGE_SIZE),
  });

  if (sorting) {
    params.set("sort", sorting.column);
    params.set("order", sorting.order);
  }

  return `/data/${encodeURIComponent(jobId)}?${params.toString()}`;
}

function isColumns(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((column) => typeof column === "string" && column.trim().length > 0)
  );
}

function isResultRow(value: unknown): value is Record<string, ResultsTableCellValue> {
  if (!isRecord(value)) return false;

  return Object.values(value).every(isCellValue);
}

function isCellValue(value: unknown): value is ResultsTableCellValue {
  return value === null || typeof value === "string" || isFiniteNumber(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function shouldUseMockFallback(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_RESULTS_TABLE_MOCK === "true";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Die Ergebnistabelle konnte nicht geladen werden.";
}
