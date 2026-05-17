import "./AnalysisTable.css";
import type { AnalysisRow } from "../mocks/analysisMock";

type Props = {
  columns: string[];
  rows: AnalysisRow[];
};

export default function AnalysisTable({ columns, rows }: Props) {
  return (
    <div className="table-container">
      <table className="analysis-table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}>{col}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td data-label={columns[0]}>{row.id}</td>
              <td data-label={columns[1]}>{row.concentration.toFixed(2)}</td>
              <td data-label={columns[2]}>{row.unit}</td>
              <td data-label={columns[3]}>{row.date}</td>
              <td data-label={columns[4]}>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
