import type { FilteringStatsResponse } from "../utils/types";

export const filteringStatsMock: FilteringStatsResponse = {
  status: "filtering_done",
  filterStats: {
    totalProbes: 500000,
    removedLowQuality: 12000,
    removedFailedSamples: 3000,
    remaining: 485000,
  },
};
