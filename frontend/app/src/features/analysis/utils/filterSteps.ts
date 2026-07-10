import type { BaseFilterStats, FilteringStatsType, FilterStep } from "../types";

/**
 * Keys of the per-probe filter stats within {@link FilteringStatsType}.
 * Sample-level quality control is intentionally excluded — it is not a probe
 * filter and is rendered separately.
 */
type ProbeFilterKey = "det_p" | "bead_count" | "non_cpg" | "snp" | "multi_hit" | "xy_chromosomes";

/**
 * Declarative description of a probe filter for the results table.
 *
 * Adding a new probe filter is a single entry here — the table rows are derived
 * from this configuration rather than from repeated conditional blocks.
 */
interface ProbeFilterConfig {
  /** Which stats object in {@link FilteringStatsType} this filter reads. */
  key: ProbeFilterKey;
  /** Display name shown in the table. */
  name: string;
  /** Optional label describing the filter's primary parameter (e.g. "Cutoff"). */
  label?: string;
  /** Extracts the parameter value to show next to the name, if the filter has one. */
  getLabelValue?: (stats: FilteringStatsType) => number | undefined;
}

/**
 * The probe filters in the fixed order they are displayed. The order mirrors the
 * order in which the backend applies them.
 */
const PROBE_FILTERS: readonly ProbeFilterConfig[] = [
  {
    key: "det_p",
    name: "Detection P-Value",
    label: "Cutoff",
    getLabelValue: (s) => s.det_p.cutoff,
  },
  {
    key: "bead_count",
    name: "Bead Count",
    label: "Bead Cutoff",
    getLabelValue: (s) => s.bead_count.bead_cutoff,
  },
  { key: "non_cpg", name: "Non-CpG" },
  { key: "snp", name: "SNP", label: "SNP Cutoff", getLabelValue: (s) => s.snp.maf_cutoff },
  { key: "multi_hit", name: "Multi-Hit" },
  { key: "xy_chromosomes", name: "XY Chromosomes" },
];

/**
 * Builds the ordered list of table rows for the enabled probe filters.
 *
 * Only filters that were actually applied (`enabled === true`) are included, and
 * they are returned in their canonical display order.
 *
 * @param stats - The filtering audit trail from the backend.
 * @returns One {@link FilterStep} per enabled probe filter, in display order.
 */
export function buildFilterSteps(stats: FilteringStatsType): FilterStep[] {
  return PROBE_FILTERS.filter((config) => stats[config.key]?.enabled).map((config) => {
    const filterStats: BaseFilterStats = stats[config.key];
    return {
      name: config.name,
      label: config.label,
      labelValue: config.getLabelValue?.(stats),
      removed: filterStats.removed,
      after: filterStats.after,
    };
  });
}
