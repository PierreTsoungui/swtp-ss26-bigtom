import { useState } from "react";

/** Filters specific to Differentially Methylated Positions (DMP). */
export type DmpFilters = {
  chr: string;
  start: string;
  stop: string;
  gene: string;
  feature: string;
  cgi: string;
  adj_p_value: string;
  delta_beta: string;
  delta_direction: string;
  group2_avg_min: string;
  group2_avg_max: string;
  group1_avg_min: string;
  group1_avg_max: string;
  log_fc_min: string;
  log_fc_max: string;
  dmr_id: string;
};

/** Filters specific to Differentially Methylated Regions (DMR). */
export type DmrFilters = {
  chr: string;
  dmrid: string;
  start: string;
  stop: string;
  p_value: string;
  mean_diff_min: string;
  mean_diff_max: string;
  width_min: string;
  width_max: string;
  n_dmps_min: string;
  n_dmps_max: string;
};

/** Union type for results table filtering. */
export type TableFilters = DmpFilters | DmrFilters;

/** Internal state structure for all table-specific filters. */
type FilterState = {
  dmp: DmpFilters;
  dmr: DmrFilters;
};

const EMPTY_DMP_FILTERS: DmpFilters = {
  chr: "",
  start: "",
  stop: "",
  gene: "",
  feature: "",
  cgi: "",
  adj_p_value: "",
  delta_beta: "",
  delta_direction: "",
  group2_avg_min: "",
  group2_avg_max: "",
  group1_avg_min: "",
  group1_avg_max: "",
  log_fc_min: "",
  log_fc_max: "",
  dmr_id: "",
};

const EMPTY_DMR_FILTERS: DmrFilters = {
  chr: "",
  dmrid: "",
  start: "",
  stop: "",
  p_value: "",
  mean_diff_min: "",
  mean_diff_max: "",
  width_min: "",
  width_max: "",
  n_dmps_min: "",
  n_dmps_max: "",
};

/**
 * Manages the complex filtering state for DMP and DMR result tables.
 *
 * Implements a **Draft/Apply pattern**:
 * - `draftFilters`: Temporary state updated during user input.
 * - `appliedFilters`: Static state used to trigger API requests.
 *
 * @param onResetPage - Optional callback to reset pagination when filters are cleared.
 */
export function useTableFilters(onResetPage?: () => void) {
  /** Uncommitted user input. */
  const [draftFilters, setDraftFilters] = useState<FilterState>({
    dmp: { ...EMPTY_DMP_FILTERS },
    dmr: { ...EMPTY_DMR_FILTERS },
  });

  /** Filters currently active for data fetching. */
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({
    dmp: { ...EMPTY_DMP_FILTERS },
    dmr: { ...EMPTY_DMR_FILTERS },
  });

  /**
   * Updates a single filter field in the draft state.
   */
  const updateDraftFilter = <K extends keyof FilterState>(
    table: K,
    key: keyof FilterState[K],
    value: string,
  ) => {
    setDraftFilters((prev) => ({
      ...prev,
      [table]: {
        ...prev[table],
        [key]: value,
      },
    }));
  };

  /**
   * Commits current draft filters to the active state to trigger a data fetch.
   */
  const applyFilters = <K extends keyof FilterState>(table: K) => {
    setAppliedFilters((prev) => ({
      ...prev,
      [table]: draftFilters[table],
    }));
  };

  /**
   * Clears all filters for a specific table and synchronizes draft/active states.
   */
  const resetFilters = <K extends keyof FilterState>(table: K) => {
    const emptyFilters = table === "dmp" ? EMPTY_DMP_FILTERS : EMPTY_DMR_FILTERS;
    setDraftFilters((prev) => ({ ...prev, [table]: { ...emptyFilters } }));
    setAppliedFilters((prev) => ({ ...prev, [table]: { ...emptyFilters } }));
    if (onResetPage) onResetPage();
  };

  /** Returns true if at least one filter field is non-empty. */
  const hasFilters = <K extends keyof FilterState>(table: K): boolean => {
    return Object.values(appliedFilters[table]).some((v) => v !== "");
  };

  return {
    draftFilters,
    appliedFilters,
    updateDraftFilter,
    applyFilters,
    resetFilters,
    hasFilters,
  };
}
