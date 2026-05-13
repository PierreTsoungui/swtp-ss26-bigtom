import { useMemo } from "react";
import { filteringStatsMock } from "../mocks/filteringStatsMock";
import type { FilteringStatsResponse } from "../utils/types";

export function useFilteringStats(jobId: string | null): FilteringStatsResponse | null {
  return useMemo(() => {
    if (!jobId) return null;

    // TODO: Mockdaten durch echten Backend-API-Call ersetzen, sobald der Endpoint verfügbar ist.
    return filteringStatsMock;
  }, [jobId]);
}
