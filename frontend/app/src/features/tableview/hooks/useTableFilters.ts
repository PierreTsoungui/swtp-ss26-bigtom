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

export function useTableFilters(onResetPage?: () => void) {
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

  const updateDraftFilter = (table: string, key: keyof TableFilters, value: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      [table]: {
        ...prev[table],
        [key]: value,
      },
    }));
  };

  const applyFilters = (table: string) => {
    setAppliedFilters((prev) => ({
      ...prev,
      [table]: draftFilters[table],
    }));
  };

  const resetFilters = (table: string) => {
    setDraftFilters((prev) => ({
      ...prev,
      [table]: { ...EMPTY_FILTERS },
    }));

    setAppliedFilters((prev) => ({
      ...prev,
      [table]: { ...EMPTY_FILTERS },
    }));

    // Seite zurücksetzen (optional)
    if (onResetPage) {
      onResetPage();
    }
  };

  const hasFilters = (table: string): boolean => {
    const filters = appliedFilters[table];
    return Object.values(filters).some(
      (value) => value !== "" && value !== null
    );
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