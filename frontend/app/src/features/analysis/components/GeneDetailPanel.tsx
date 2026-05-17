import type { MethylationRow } from "../mocks/methylationMock";

type Props = {
  selectedCpg: MethylationRow | null;
};

export default function GeneDetailPanel({ selectedCpg }: Props) {
  if (!selectedCpg) {
    return (
      <div className="gene-detail-card">
        <p style={{ color: "#6c7f9c", textAlign: "center" }}>
          Klicken Sie auf eine CpG-Zeile für Details
        </p>
      </div>
    );
  }

  return (
    <div className="gene-detail-card">
      <div className="gene-detail-header">
        <h3>🧬 {selectedCpg.geneSymbol}</h3>
        <span className="badge-sig top-badge">Top differentiell</span>
      </div>
      <div className="gene-cpg-id">
        <span className="cpg-badge">{selectedCpg.cpgId}</span>
      </div>
      <p className="gene-description">
        <strong>{selectedCpg.geneSymbol}</strong> –{" "}
        {selectedCpg.geneDescription || "Keine Beschreibung verfügbar"}
      </p>
      <div className="gene-location-box">
        <div>📍 Lokalisierung: Chr{selectedCpg.chromosome}:{selectedCpg.position.toLocaleString()}</div>
        <div>🧬 Region: {selectedCpg.region}</div>
        <div>📈 β-Werte: <strong>Δβ = {selectedCpg.deltaBeta > 0 ? "+" : ""}{selectedCpg.deltaBeta}</strong> | p = {selectedCpg.pValue.toExponential(2)}</div>
      </div>
      <div className="detail-button">
        <div className="norm-option" style={{ display: "inline-block", background: "#f1f5f9" }}>
          Details anzeigen (Mock)
        </div>
      </div>
    </div>
  );
}
