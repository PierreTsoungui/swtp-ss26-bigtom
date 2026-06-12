import { useState } from "react";
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import type {DmpFilters, DmrFilters} from "../hooks/useTableFilters.ts";


// Filter-Definitionen pro Tabelle
const FILTER_DEFINITIONS = {
  dmp: [
    { key: "chr", label: "Chromosom", type: "select", options: getChromosomeOptions() },
    { key: "start", label: "Start Position", type: "number", group: "positional" },
    { key: "stop", label: "Stop Position", type: "number", group: "positional" },
    { key: "gene", label: "Gen", type: "text" },
    { key: "adj_p_value", label: "Adj. P-Value (≤)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "delta_beta", label: "Delta Beta (abs ≥)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "group1_avg_min", label: "Group1 Avg (Min)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "group1_avg_max", label: "Group1 Avg (Max)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "group2_avg_min", label: "Group2 Avg (Min)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "group2_avg_max", label: "Group2 Avg (Max)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "log_fc_min", label: "Log FC (abs Min)", type: "number", step: 0.1 },
    { key: "log_fc_max", label: "Log FC (abs Max)", type: "number", step: 0.1 },
    { key: "sample_group", label: "Sample Group", type: "text" },
  ],
  dmr: [
    { key: "chr", label: "Chromosom", type: "select", options: getChromosomeOptions() },
    { key: "dmrid", label: "DMR ID", type: "text" },
    { key: "start", label: "Start Position (≥)", type: "number", group: "positional" },
    { key: "stop", label: "Stop Position (≤)", type: "number", group: "positional" },
    { key: "p_value", label: "P-Value (≤)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "mean_diff_min", label: "Mean Diff (abs Min)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "mean_diff_max", label: "Mean Diff (abs Max)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "width_min", label: "Width (Min)", type: "number", min: 0 },
    { key: "width_max", label: "Width (Max)", type: "number", min: 0 },
    { key: "n_dmps_min", label: "N-DMPs (Min)", type: "number", min: 0 },
    { key: "n_dmps_max", label: "N-DMPs (Max)", type: "number", min: 0 },
  ],
};

function getChromosomeOptions() {
  const options = Array.from({ length: 22 }, (_, i) => ({
    value: `chr${i + 1}`,
    label: `chr${i + 1}`,
  }));
  options.push({ value: "chrX", label: "chrX" });
  options.push({ value: "chrY", label: "chrY" });
  return options;
}


interface TableFiltersProps<T extends DmpFilters | DmrFilters> {
  table: "dmp" | "dmr";
  filters: T;
  onChange: <K extends keyof T>(key: K, value: string) => void;
  onApply: () => void;
  onReset: () => void;
}

export function TableFilters<T extends DmpFilters | DmrFilters>({
  table,
  filters,
  onChange,
  onApply,
  onReset,
}: TableFiltersProps<T>) {
  const [showFilters, setShowFilters] = useState(false);
  
  const hasFilters = Object.values(filters).some(
    (value) => value !== "" && value !== null
  );

  // Anzahl aktiver Filter zählen
  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== "" && v !== null
  ).length;

  const filterDefs = FILTER_DEFINITIONS[table];

  const handleChange = (key: string, value: string) => {
    onChange(key as keyof T, value);
  };
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

      {/* Filter Panel */}
      {showFilters && (
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filterDefs.map((filterDef) => (
                  <div key={filterDef.key}>
                    {filterDef.type === "select" ? (
                        <select
                            value={(filters as any)[filterDef.key] || ""}
                            onChange={(e) => handleChange(filterDef.key, e.target.value)}
                            className="w-full border border-slate-300 p-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">{filterDef.label}</option>
                          {filterDef.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                          ))}
                        </select>
                    ) : (
                        <input
                            type={filterDef.type}
                            placeholder={filterDef.label}
                            value={(filters as any)[filterDef.key] || ""}
                            onChange={(e) => handleChange(filterDef.key, e.target.value)}
                            step={(filterDef as any).step}
                            min={(filterDef as any).min}
                            max={(filterDef as any).max}
                            className="w-full border border-slate-300 p-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    )}
                  </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
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