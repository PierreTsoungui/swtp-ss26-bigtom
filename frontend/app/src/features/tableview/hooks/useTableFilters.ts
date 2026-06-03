import { useState } from "react";

export type TableFilters = {
  chromosome: string;

  start: string;
  stop: string;

  dmrId: string;

  pValue: string;
  adjPValue: string;
};

const EMPTY_FILTERS: TableFilters = {
  chromosome: "",

  start: "",
  stop: "",

  dmrId: "",

  pValue: "",
  adjPValue: "",
};

export function useTableFilters() {
  const [draftFilters, setDraftFilters] =
    useState<Record<string, TableFilters>>({
      dmp: { ...EMPTY_FILTERS },
      dmr: { ...EMPTY_FILTERS },
    });

  const [appliedFilters, setAppliedFilters] =
    useState<Record<string, TableFilters>>({
      dmp: { ...EMPTY_FILTERS },
      dmr: { ...EMPTY_FILTERS },
    });

  const applyFilters = (
    table: string
  ) => {
    setAppliedFilters((prev) => ({
      ...prev,
      [table]: draftFilters[table],
    }));
  };

  const resetFilters = (
    table: string
  ) => {
    setDraftFilters((prev) => ({
      ...prev,
      [table]: { ...EMPTY_FILTERS },
    }));

    setAppliedFilters((prev) => ({
      ...prev,
      [table]: { ...EMPTY_FILTERS },
    }));
  };

  return {
    draftFilters,
    appliedFilters,

    setDraftFilters,

    applyFilters,
    resetFilters,
  };
}