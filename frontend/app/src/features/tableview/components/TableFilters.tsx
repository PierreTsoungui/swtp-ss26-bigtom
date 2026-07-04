import { useState } from "react";
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import ArrowRightIcon from '@mui/icons-material/ArrowRight';
import type {DmpFilters, DmrFilters} from "../hooks/useTableFilters.ts";


// Filter-Definitionen pro Tabelle
const FILTER_DEFINITIONS = {
  dmp: [
    { key: "chr", label: "Chromosom", type: "select", options: getChromosomeOptions() },
    { key: "start", label: "Start Position", type: "number", group: "positional", min: 0 },
    { key: "stop", label: "Stop Position", type: "number", group: "positional", min: 0 },
    { key: "gene", label: "Gene (contains)", type: "text" },
    { key: "feature", label: "Feature", type: "select", options: getFeatureOptions() },
    { key: "cgi", label: "CpG context", type: "select", options: getCgiOptions() },
    { key: "adj_p_value", label: "Adj. P-Value (≤)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "delta_beta", label: "Delta Beta (abs ≥)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "delta_direction", label: "Direction", type: "select", options: getDirectionOptions() },
    { key: "group1_avg_min", label: "Group1 Avg (Min)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "group1_avg_max", label: "Group1 Avg (Max)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "group2_avg_min", label: "Group2 Avg (Min)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "group2_avg_max", label: "Group2 Avg (Max)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "log_fc_min", label: "Log FC (abs Min)", type: "number", step: 0.1 },
    { key: "log_fc_max", label: "Log FC (abs Max)", type: "number", step: 0.1 },
    { key: "dmr_id", label: "DMR ID", type: "text" },
  ],
  dmr: [
    { key: "chr", label: "Chromosom", type: "select", options: getChromosomeOptions() },
    { key: "dmrid", label: "DMR ID", type: "text" },
    { key: "start", label: "Start Position (≥)", type: "number", group: "positional", min: 0 },
    { key: "stop", label: "Stop Position (≤)", type: "number", group: "positional", min: 0 },
    { key: "p_value", label: "P-Value (≤)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "mean_diff_min", label: "Mean Diff (abs Min)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "mean_diff_max", label: "Mean Diff (abs Max)", type: "number", step: 0.01, min: 0, max: 1 },
    { key: "width_min", label: "Width (Min)", type: "number", min: 0 },
    { key: "width_max", label: "Width (Max)", type: "number", min: 0 },
    { key: "n_dmps_min", label: "N-DMPs (Min)", type: "number", min: 0 },
    { key: "n_dmps_max", label: "N-DMPs (Max)", type: "number", min: 0 },
  ],
};

/**
 * Metadata defining the input type and constraints for individual table filters.
 */
type FilterDef = { key: string; label: string; type: string; min?: number; max?: number };

/**
 * Validates filter inputs against their defined types and logical constraints.
 *
 * Logic includes:
 * - **Numeric Checks**: Ensures inputs are finite numbers within [min, max] range.
 * - **Genomic Integrity**: Validates that the 'Start' position does not exceed the 'Stop' position.
 *
 * @returns A map of field keys to English error messages.
 */
function validateFilters(
  values: Record<string, string>,
  defs: FilterDef[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  const parsed: Record<string, number> = {};

  for (const def of defs) {
    if (def.type !== "number") continue;
    const raw = (values[def.key] ?? "").trim();
    if (raw === "") continue;

    const n = Number(raw);
    if (!Number.isFinite(n)) {
      errors[def.key] = `${def.label}: must be a number`;
      continue;
    }
    if (def.min !== undefined && n < def.min) {
      errors[def.key] = `${def.label}: must be ≥ ${def.min}`;
      continue;
    }
    if (def.max !== undefined && n > def.max) {
      errors[def.key] = `${def.label}: must be ≤ ${def.max}`;
      continue;
    }
    parsed[def.key] = n;
  }

  // Genomic range: Start must not exceed Stop.
  if (
    parsed.start !== undefined &&
    parsed.stop !== undefined &&
    parsed.start > parsed.stop
  ) {
    errors.stop = "Stop position must be ≥ start position";
  }

  return errors;
}

/**
 * Provides genomic region categories based on standard Illumina and ChAMP specifications.
 * @returns Array of options for feature-based filtering
 */
function getFeatureOptions() {
  return ["TSS1500", "TSS200", "5'UTR", "1stExon", "Body", "ExonBnd", "3'UTR", "IGR", "Unknow"]
    .map((v) => ({ value: v, label: v }));
}

/**
 * Provides CpG island context categories.
 * @returns Array of options for context-based filtering (e.g., Island, OpenSea).
 */
function getCgiOptions() {
  return ["Island", "Shore", "Shelf", "OpenSea"].map((v) => ({ value: v, label: v }));
}

/**
 * Defines the direction of methylation changes (Delta Beta).
 * @returns Options for filtering hypermethylated (Δβ > 0) or hypomethylated (Δβ < 0) positions.
 */
function getDirectionOptions() {
  return [
    { value: "hyper", label: "Hyper (Δβ > 0)" },
    { value: "hypo", label: "Hypo (Δβ < 0)" },
  ];
}

/**
 * Generates a standard list of human chromosome options (chr1-22, X, Y).
 * @returns A formatted list of chromosome identifiers for selection inputs.
 */
function getChromosomeOptions() {
  const options = Array.from({ length: 22 }, (_, i) => ({
    value: `chr${i + 1}`,
    label: `chr${i + 1}`,
  }));
  options.push({ value: "chrX", label: "chrX" });
  options.push({ value: "chrY", label: "chrY" });
  return options;
}


/**
 * Props for the TableFilters component.
 */
interface TableFiltersProps<T extends DmpFilters | DmrFilters> {
  /** The specific analysis result type ('dmp' or 'dmr'). */
  table: "dmp" | "dmr";
  /** Current state of the draft filter values. */
  filters: T;
  /** Callback fired when a filter input is modified. */
  onChange: <K extends keyof T>(key: K, value: string) => void;
  /** Triggers the data fetch using current filter values. */
  onApply: () => void;
  /** Resets all filters to their initial empty state. */
  onReset: () => void;
}


/**
 * A dynamic filter management interface for result tables.
 *
 * It automatically generates appropriate input fields (selects, numbers, text)
 * based on the {@link FILTER_DEFINITIONS}. Includes real-time validation to
 * prevent invalid API requests.
 */
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

  // Typed validation so a non-number (or out-of-range / start>stop) shows a clear
  // message and blocks Apply — instead of silently sending a bad request.
  const errors = validateFilters(filters as Record<string, string>, filterDefs);
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="mb-4">
      {/* Toggle Button */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-textSecondary bg-neutral-card border border-neutral-borderEmphasis rounded-md hover:bg-neutral-background transition-colors"
        >
          {showFilters ? <ArrowDropDownIcon /> : <ArrowRightIcon />}
          Filter
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-info-badgeBackground text-info-badgeText rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>
        
        {activeFilterCount > 0 && (
          <button
            onClick={onReset}
            className="text-sm text-neutral-textSecondary hover:text-neutral-textPrimary"
          >
            Reset All
          </button>
        )}
      </div>

      {/* Filter Panel */}
      {showFilters && (
          <div className="p-4 bg-neutral-background rounded-lg border border-neutral-borderDefault">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filterDefs.map((filterDef) => (
                  <div key={filterDef.key}>
                    {filterDef.type === "select" ? (
                        <select
                            value={(filters as any)[filterDef.key] || ""}
                            onChange={(e) => handleChange(filterDef.key, e.target.value)}
                            className="w-full border border-neutral-borderEmphasis p-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                          <option value="">{filterDef.label}</option>
                          {filterDef.options?.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                          ))}
                        </select>
                    ) : (
                        // Numeric fields are rendered as text so an invalid entry
                        // (e.g. "abc") stays visible and can be flagged, rather
                        // than being silently dropped by a native number input.
                        <input
                            type="text"
                            inputMode={filterDef.type === "number" ? "decimal" : "text"}
                            placeholder={filterDef.label}
                            value={(filters as any)[filterDef.key] || ""}
                            onChange={(e) => handleChange(filterDef.key, e.target.value)}
                            aria-invalid={Boolean(errors[filterDef.key])}
                            className={`w-full border p-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary ${
                                errors[filterDef.key]
                                    ? "border-danger"
                                    : "border-neutral-borderEmphasis"
                            }`}
                        />
                    )}
                    {errors[filterDef.key] && (
                        <p className="mt-1 text-xs text-danger">{errors[filterDef.key]}</p>
                    )}
                  </div>
              ))}
            </div>

            {hasErrors && (
              <p className="mt-3 text-sm text-danger">
                Please fix the highlighted fields before applying.
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                  onClick={onApply}
                  disabled={!hasFilters || hasErrors}
                  className="rounded-md border-2 border-primary bg-primary px-4 py-2 text-sm font-medium text-primary-text transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-neutral-textSecondary disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
              >
                Apply
              </button>

              <button
                  onClick={onReset}
                  className="px-4 py-2 border border-neutral-borderEmphasis rounded-md text-sm font-medium text-neutral-textSecondary hover:bg-neutral-surface transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
      )}
    </div>
  );
}