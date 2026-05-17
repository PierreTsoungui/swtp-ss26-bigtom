// app/src/features/analysisTabelle/tabellePage.tsx
import { useState } from "react";
import MethylationResultsTable from "../analysis/components/MethylationResultsTable";
import FilterPanel from "../analysis/components/FilterPanel";
import GeneDetailPanel from "../analysis/components/GeneDetailPanel";
import { methylationRows, statsMock } from "../analysis/mocks/methylationMock";
import type { MethylationRow } from "../analysis/mocks/methylationMock";
import "./tabellePage.css";

export default function TabellePage() {
  const [selectedCpg, setSelectedCpg] = useState<MethylationRow | null>(methylationRows[0]);
  const [activeNorm, setActiveNorm] = useState<string>("BMIQ (Illumina)");

  const normOptions = ["BMIQ (Illumina)", "Quantile", "Noob + SWAN", "Funktionale Normalisierung"];

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header-bar">
        <div className="logo-title-group">
          <div className="thm-logo">
            <div className="thm-icon">
              {[...Array(9)].map((_, i) => (
                <span key={i}></span>
              ))}
            </div>
            <div className="thm-text">
              <div className="thm-main">THM</div>
              <div className="thm-sub">TECHNISCHE HOCHSCHULE MITTELHESSEN</div>
            </div>
          </div>
          <div className="title-area">
            <h1>🧬 Methylation Explorer</h1>
            <p>Epigenetic landscape · CpG analysis</p>
          </div>
        </div>
        <div className="legal-buttons">
          <button onClick={() => alert("📌 IMPRESSUM: Methylation Explorer Demo")}>📄 Impressum</button>
          <button onClick={() => alert("🔒 DATENSCHUTZ: Keine personenbezogenen Daten")}>🔒 Datenschutz</button>
          <button onClick={() => alert("ℹ️ Über uns: DNA-Methylierungsanalyse-Oberfläche")}>ℹ️ Über uns</button>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* LEFT MAIN AREA */}
        <div className="main-left">
          {/* Datenimport */}
          <div className="import-section">
            <div className="section-title">📂 Datenimport</div>
            <div className="import-grid">
              <div className="import-item">📄 Unbehandelt.idat</div>
              <div className="import-item">🧪 Behandelt.idat</div>
              <div className="import-item">📑 Samplesheet.csv</div>
              <button className="btn-primary" onClick={() => alert("Analyse gestartet")}>🚀 Analyse starten</button>
            </div>
          </div>

          {/* Statistics + Normalization */}
          <div className="stats-norm-box">
            <div className="stats-row">
              <div className="stat-block">
                <div className="stat-label">Gesamt CpGs</div>
                <div className="stat-number">{statsMock.totalCpgs.toLocaleString()}</div>
              </div>
              <div className="stat-block">
                <div className="stat-label">Signifikante CpGs (p&lt;0.05)</div>
                <div className="stat-number">{statsMock.significantCpgs.toLocaleString()}</div>
              </div>
              <div className="stat-block">
                <div className="stat-label">Mittelwert Δβ</div>
                <div className="stat-number">{statsMock.meanDeltaBeta > 0 ? "+" : ""}{statsMock.meanDeltaBeta}</div>
              </div>
            </div>
            <div className="norm-selector">
              <div className="norm-title">⚙️ Ausgewählte Normalisierung</div>
              <div className="norm-buttons">
                {normOptions.map((method) => (
                  <div key={method} className={`norm-option ${activeNorm === method ? "active" : ""}`} onClick={() => setActiveNorm(method)}>
                    {method}
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "0.7rem", marginTop: "12px", color: "#5f7f9e" }}>✅ aktuelle Normalisierung: {activeNorm} · Parameter standard</div>
            </div>
          </div>

          {/* Mini summary */}
          <div className="mini-summary">
            <div className="mini-stat"><strong>🧬 865k</strong> erkannte CpGs</div>
            <div className="mini-stat"><strong>📊 4.058</strong> differentiell methyliert</div>
            <div className="mini-stat"><strong>🎯 FDR</strong> p &lt; 0.05</div>
          </div>

          {/* Table + Filter */}
          <div className="table-filter-section">
            <MethylationResultsTable rows={methylationRows} onRowClick={setSelectedCpg} />
            <FilterPanel />
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="right-panel">
          <GeneDetailPanel selectedCpg={selectedCpg} />

          <div className="filter-params-card">
            <div style={{ fontWeight: 600, fontSize: "0.8rem", marginBottom: "10px" }}>⚙️ Filterparameter (aktiv)</div>
            <div className="filter-param-row"><span>p-Wert Schwelle</span><span><strong>0.05</strong></span></div>
            <div className="filter-param-row"><span>Korrekturmethode</span><span><strong>FDR (Benjamini-Hochberg)</strong></span></div>
            <div className="filter-param-row"><span>Clustering</span><span><strong>Aktiviert (HCA)</strong></span></div>
            <div className="mean-beta-badge">📌 Mittelwert Δβ = {statsMock.meanDeltaBeta} (behandelt vs Kontrolle)</div>
          </div>

          <div className="histogram-card">
            <div style={{ fontSize: "0.7rem", fontWeight: 600, marginBottom: "8px" }}>📊 Histogramm der β-Werte (Verteilung)</div>
            <div className="histogram-bar"></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem" }}><span>Unbehandelt ███</span><span>Behandelt █████</span></div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="app-footer">
        <span>© Methylation Explorer — Epigenetik Tool (Prototyp)</span>
        <span style={{ display: "flex", gap: "24px" }}>
          <span style={{ cursor: "pointer" }}>Impressum</span>
          <span style={{ cursor: "pointer" }}>Datenschutz</span>
          <span style={{ cursor: "pointer" }}>Kontakt</span>
        </span>
      </div>
    </div>
  );
}
