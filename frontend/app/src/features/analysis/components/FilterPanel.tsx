// app/src/features/analysis/components/FilterPanel.tsx
import { useState } from "react";

type FilterPanelProps = {
  onFilterChange?: (filters: any) => void;
};

export default function FilterPanel({ onFilterChange }: FilterPanelProps) {
  const [activeDirection, setActiveDirection] = useState<string>("Alle");
  const [activeSort, setActiveSort] = useState<string>("p-Wert");

  const directionOptions = ["Alle", "Hyper methyliert (Δβ > 0)", "Hypo methyliert (Δβ < 0)"];
  const regionOptions = ["Promotor", "Körper", "5'UTR", "Intron"];
  const sortOptions = ["p-Wert", "|Δβ|", "CpG ID"];

  return (
    <div className="sort-filter-panel">
      <h4>🔍 Sortieren & Filtern</h4>

      <div className="filter-group">
        <label>📌 CpG / Gen Suche</label>
        <div className="mock-input">Nach Gen oder CpG suchen... 🔎</div>
      </div>

      <div className="filter-group">
        <label>📊 p-Wert Bereich</label>
        <div className="mock-select">min: 0 &nbsp;&nbsp; max: 0.05</div>
      </div>

      <div className="filter-group">
        <label>🧬 Δβ Richtung</label>
        <div className="sort-buttons">
          {directionOptions.map((opt) => (
            <div
              key={opt}
              className={`sort-chip ${activeDirection === opt ? "active" : ""}`}
              onClick={() => setActiveDirection(opt)}
            >
              {opt}
            </div>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>📌 Genregion</label>
        <div className="sort-buttons">
          {regionOptions.map((opt) => (
            <div key={opt} className="sort-chip">
              {opt}
            </div>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <label>⚡ Sortierung nach</label>
        <div className="sort-buttons">
          {sortOptions.map((opt) => (
            <div
              key={opt}
              className={`sort-chip ${activeSort === opt ? "active" : ""}`}
              onClick={() => setActiveSort(opt)}
            >
              {opt}
            </div>
          ))}
        </div>
      </div>

      <hr />

      <div className="filter-group">
        <label>📁 Weitere Filter</label>
        <div className="mock-input">FDR &lt; 0.05 (fixed)</div>
        <div className="mock-input" style={{ marginTop: "6px" }}>
          Mind. β-Differenz &gt; 0.2
        </div>
      </div>

      <div className="filter-apply-button">
        <div className="norm-option" style={{ background: "#eef2fa" }}>
          Filter anwenden (Demo)
        </div>
      </div>

      <div className="demo-note">✨ Klickbare UI-Elemente — nicht funktional (Prototyp)</div>
    </div>
  );
}
