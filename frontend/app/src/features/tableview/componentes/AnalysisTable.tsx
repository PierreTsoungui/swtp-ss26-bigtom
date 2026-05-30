type Props = {
  data: any;
};

export function AnalysisTable({
  data,
}: Props) {
  if (!data) {
    return <p>Keine Daten vorhanden.</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full border">
        <thead>
          <tr>
            {data.columns.map((column: any) => (
              <th
                key={column.key}
                className="border p-2 text-left"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.data.map((row: any, index: number) => (
            <tr key={index}>
              {data.columns.map((column: any) => (
                <td
                  key={column.key}
                  className="border p-2"
                >
                  {row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}