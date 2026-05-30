import { useEffect, useState } from "react";

export function useTableData(
  jobId: string | null,
  tableName: string
) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) return;

    const load = async () => {
      setLoading(true);

      const response = await fetch(
        `/api/v1/table/${jobId}/${tableName}`
      );

      const json = await response.json();

      setData(json);
      setLoading(false);
    };

    load();
  }, [jobId, tableName]);

  return {
    data,
    loading,
  };
}