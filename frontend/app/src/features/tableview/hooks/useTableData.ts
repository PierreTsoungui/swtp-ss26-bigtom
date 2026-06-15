import { useEffect, useState } from "react";
import type { TableFilters } from "./useTableFilters";

export function useTableData(
  jobId: string | null,
  table: string,
  sort_by: string | null,
  sort_order: string | null,
  filters?: TableFilters,
  page: number = 1,
  pageSize: number = 75
) {
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