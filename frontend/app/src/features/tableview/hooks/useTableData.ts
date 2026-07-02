import { useEffect, useState } from "react";
import type { TableFilters } from "./useTableFilters";

/**
 * Result of the {@link useTableData} hook.
 */
interface UseTableDataResult {
  /** The paginated data rows and metadata from the server. */
  data: any;
  /** Indicates if a data fetch is currently in progress. */
  loading: boolean;
  /** Human-readable error message if the request fails. */
  error: string | null;
}

/**
 * Fetches paginated, sorted, and filtered data for a specific analysis table.
 *
 * This hook synchronizes local UI state (pagination, sorting) with the backend
 * API, converting filter objects into URL-encoded query parameters.
 *
 * @param jobId - The unique identifier of the analysis job.
 * @param table - The name of the table to fetch (e.g., 'dmp' or 'dmr').
 * @param sort_by - The column key used for sorting.
 * @param sort_order - The sorting direction ('asc' or 'desc').
 * @param filters - Optional key-value pairs for server-side data filtering.
 * @param page - Current page number (1-indexed).
 * @param pageSize - Number of records per page.
 */
export function useTableData(
  jobId: string | null,
  table: string,
  sort_by: string | null,
  sort_order: string | null,
  filters?: TableFilters,
  page: number = 1,
  pageSize: number = 75
): UseTableDataResult {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();

      if (sort_by && sort_order) {
        params.append("sort_by", sort_by);
        params.append("sort_order", sort_order);
      }

      params.append("page", String(page));
      params.append("page_size", String(pageSize));

      if (filters) {
        Object.entries(filters).forEach(([key, value]) => {
          if (value && value !== "") {
            params.append(`filter_${key}`, value);
          }
        });
      }

      try {
        const res = await fetch(
            `/api/v1/table/${jobId}/${table}?${params.toString()}`
        );

        if (!res.ok) {
          throw new Error("Failed to load table");
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(
            err instanceof Error ? err.message : "Unknown error"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobId, table, sort_by, sort_order, filters, page, pageSize]);

  return {data, loading, error};
}