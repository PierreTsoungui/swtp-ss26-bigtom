import { useEffect, useState } from "react";

// export function useTableData(
//   jobId: string | null,
//   tableName: string
// ) {
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     if (!jobId) return;

//     const load = async () => {
//       setLoading(true);

//       const response = await fetch(
//         `/api/v1/table/${jobId}/${tableName}`
//       );

//       const json = await response.json();

//       setData(json);
//       setLoading(false);
//     };

//     load();
//   }, [jobId, tableName]);

//   return {
//     data,
//     loading,
//   };
// }

export function useTableData(
  jobId: string | null,
  table: string,
  sort_by: string | null,
  sort_order: string | null
) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    if (!jobId) return;

    const fetchData = async () => {
      const params = new URLSearchParams();

      if (sort_by && sort_order) {
        params.append("sort_by", sort_by);
        params.append("sort_order", sort_order);
      }

      const res = await fetch(
        `/api/v1/table/${jobId}/${table}?${params.toString()}`
      );

      const json = await res.json();
      setData(json);
    };

    fetchData();
  }, [jobId, table, sort_by, sort_order]);

  return { data };
}