import type { TableFilters } from "../hooks/useTableFilters";
import { useState } from "react";
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';

type Props = {
  table: "dmp" | "dmr";  
  filters: TableFilters;
  onChange: (key: keyof TableFilters, value: string) => void;
  onApply: () => void;
  onReset: () => void;
};

export function TableFilters({
  table,
  filters,
  onChange,
  onApply,
  onReset,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  
  const hasFilters = Object.values(filters).some(
    (value) => value !== "" && value !== null
  );

  // Anzahl aktiver Filter zählen
  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== "" && v !== null
  ).length;

  return (
    <div className="mb-4">
      {/* Toggle Button */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
        >
          {showFilters ? <ArrowDropDownIcon /> : <ArrowRightIcon />}
          Filter
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
        
        {activeFilterCount > 0 && (
          <button
            onClick={onReset}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Alle zurücksetzen
          </button>
        )}
      </div>

      {/* Filter Panel (nur wenn sichtbar) */}
      {showFilters && (
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex gap-3 flex-wrap">
            {/* Chromosom Select */}
            <select
              value={filters.chromosome}
              onChange={(e) => onChange("chromosome", e.target.value)}
              className="border border-slate-300 p-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Chromosom</option>
              {Array.from({ length: 22 }, (_, i) => i + 1).map((chr) => (
                <option key={chr} value={String(chr)}>chr{chr}</option>
              ))}
              <option value="X">chrX</option>
              <option value="Y">chrY</option>
            </select>

            {/* Start/Stop - nur wenn Chromosom ausgewählt */}
            {filters.chromosome && (
              <>
                <input
                  type="number"
                  placeholder="Start"
                  value={filters.start}
                  onChange={(e) => onChange("start", e.target.value)}
                  className="border border-slate-300 p-2 rounded-md text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  placeholder="Stop"
                  value={filters.stop}
                  onChange={(e) => onChange("stop", e.target.value)}
                  className="border border-slate-300 p-2 rounded-md text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </>
            )}

            {/* Nur für DMR Tabelle */}
            {table === "dmr" && (
              <input
                type="text"
                placeholder="DMR ID"
                value={filters.dmrId}
                onChange={(e) => onChange("dmrId", e.target.value)}
                className="border border-slate-300 p-2 rounded-md text-sm w-36 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}

            {/* P-Value Filter */}
            <input
              type="number"
              placeholder="P-Value"
              step="0.01"
              min="0"
              max="1"
              value={filters.pValue}
              onChange={(e) => onChange("pValue", e.target.value)}
              className="border border-slate-300 p-2 rounded-md text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            <input
              type="number"
              placeholder="Adj. P-Value"
              step="0.01"
              min="0"
              max="1"
              value={filters.adjPValue}
              onChange={(e) => onChange("adjPValue", e.target.value)}
              className="border border-slate-300 p-2 rounded-md text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Buttons */}
            <button
              onClick={onApply}
              disabled={!hasFilters}
              className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anwenden
            </button>

            <button
              onClick={onReset}
              className="px-4 py-2 border border-slate-300 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Zurücksetzen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}