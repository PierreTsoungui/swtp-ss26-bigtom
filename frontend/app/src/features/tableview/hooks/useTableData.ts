import { useEffect, useState } from "react";
import type { TableFilters } from "./useTableFilters";

export function useTableData(
  jobId: string | null,
  table: string,
  sort_by: string | null,
  sort_order: string | null,
  filters?: TableFilters

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
      if (filters?.chromosome) {
        params.append(
          "filter_chr",
          filters.chromosome
        );
      }

      if (filters?.start) {
        params.append(
          "filter_start",
          filters.start
        );
      }

      if (filters?.stop) {
        params.append(
          "filter_stop",
          filters.stop
        );
      }

      if (filters?.dmrId) {
        params.append(
          "filter_dmr",
          filters.dmrId
        );
      }

      if (filters?.pValue) {
        params.append(
          "filter_p_value",
          filters.pValue
        );
      }

      if (filters?.adjPValue) {
        params.append(
          "filter_adj_p_value",
          filters.adjPValue
        );
      }
      try {
        const res = await fetch(
          `/api/v1/table/${jobId}/${table}?${params.toString()}`
        );

        if (!res.ok) {
          throw new Error(
            "Failed to load table"
          );
        }

        const json = await res.json();

        setData(json);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unknown error"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [jobId, table, sort_by, sort_order, filters]);

  return {
  data,
  loading,
  error,
};
}