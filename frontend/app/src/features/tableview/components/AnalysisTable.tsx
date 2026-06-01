type Props = {
  data: any;
  onSort?: (column: string) => void;
  sorting?: {
    sort_by: string | null;
    sort_order: "asc" | "desc" | null;
  };
};

export function AnalysisTable({
  data,
  onSort,
  sorting,
}: Props) {
  if (!data) return <p>Keine Daten vorhanden.</p>;

  return (
    <table className="w-full border">
      <thead>
        <tr>
          {data.columns.map((col: any) => {
            const isActive = sorting?.sort_by === col.key;

            return (
              <th
                key={col.key}
                className="border p-2 cursor-pointer"
                onClick={() => onSort?.(col.key)}
              >
                {col.label}

                {/* UI INDICATOR */}
                {isActive &&
                  sorting?.sort_order === "asc" &&
                  " 🔼"}

                {isActive &&
                  sorting?.sort_order === "desc" &&
                  " 🔽"}
              </th>
            );
          })}
        </tr>
      </thead>

      <tbody>
        {data.data.map((row: any, i: number) => (
          <tr key={i}>
            {data.columns.map((col: any) => (
              <td key={col.key} className="border p-2">
                {row[col.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}