// app/src/features/analysis/components/MethylationResultsTable.tsx
import { useState } from "react";
import type { MethylationRow } from "../mocks/methylationMock";

type Props = {
  rows: MethylationRow[];
  onRowClick?: (row: MethylationRow) => void;
  rowsPerPage?: number;
};

export default function MethylationResultsTable({
  rows,
  onRowClick,
  rowsPerPage = 10
}: Props) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.ceil(rows.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const currentRows = rows.slice(startIndex, endIndex);

  const formatPValue = (p: number) => {
    if (p < 0.000001) return p.toExponential(2);
    return p.toFixed(6);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  return (
    <div className="data-table-wrapper">
      <div className="table-header-bar">
        <span className="section-title">📋 Signifikante CpGs (Auszug)</span>
        <span className="table-info-badge">
          Anzeige {startIndex + 1}–{Math.min(endIndex, rows.length)} von {rows.length}
        </span>
      </div>

      <table className="methylation-table">
        <thead>
          <tr>
            <th>CpG ID</th>
            <th>Gen Symbol</th>
            <th>Δβ</th>
            <th>p-Wert</th>
            <th>Region</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {currentRows.map((row) => (
            <tr
              key={row.cpgId}
              onClick={() => onRowClick?.(row)}
              style={{ cursor: onRowClick ? "pointer" : "default" }}
            >
              <td>{row.cpgId}</td>
              <td><strong>{row.geneSymbol}</strong></td>
              <td className="beta-value">
                {row.deltaBeta > 0 ? "+" : ""}
                {row.deltaBeta.toFixed(2)}
              </td>
              <td>{formatPValue(row.pValue)}</td>
              <td>{row.region}</td>
              <td><span className="badge-sig">{row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination-mock">
        <span>
          Seite {currentPage} von {totalPages}
        </span>
        <div>
          <button
            className="mock-btn"
            onClick={goToPrevPage}
            disabled={currentPage === 1}
            style={{ opacity: currentPage === 1 ? 0.5 : 1 }}
          >
            ← Vorherige
          </button>
          <button
            className="mock-btn"
            onClick={goToNextPage}
            disabled={currentPage === totalPages}
            style={{ opacity: currentPage === totalPages ? 0.5 : 1, marginLeft: "8px" }}
          >
            Nächste →
          </button>
        </div>
      </div>
    </div>
  );
}
