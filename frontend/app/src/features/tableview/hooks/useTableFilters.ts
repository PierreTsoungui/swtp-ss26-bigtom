import { useState } from "react";

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

export type TableFilters = DmpFilters | DmrFilters;

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

type FilterState = {
  dmp: DmpFilters;
  dmr: DmrFilters;
}
export function useTableFilters(onResetPage?: () => void) {
  const [draftFilters, setDraftFilters] =
    useState<FilterState>({
      dmp: { ...EMPTY_DMP_FILTERS },
      dmr: { ...EMPTY_DMR_FILTERS },
    });

  const [appliedFilters, setAppliedFilters] =
    useState<FilterState>({
      dmp: { ...EMPTY_DMP_FILTERS },
      dmr: { ...EMPTY_DMR_FILTERS },
    });

  const updateDraftFilter = <K extends keyof FilterState>(
      table: K,
      key: keyof FilterState[K],
      value: string
  ) => {
    setDraftFilters((prev) => ({
      ...prev,
      [table]: {
        ...prev[table],
        [key]: value,
      },
    }));
  };

  const applyFilters = <K extends keyof FilterState>(table: K) => {
    setAppliedFilters((prev) => ({
      ...prev,
      [table]: draftFilters[table],
    }));
  };

  const resetFilters = <K extends keyof FilterState>(table: K) => {
    const emptyFilters = table === "dmp" ? EMPTY_DMP_FILTERS : EMPTY_DMR_FILTERS;
    setDraftFilters((prev) => ({ ...prev, [table]: { ...emptyFilters } }));
    setAppliedFilters((prev) => ({ ...prev, [table]: { ...emptyFilters } }));
    if (onResetPage) onResetPage();
  };

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