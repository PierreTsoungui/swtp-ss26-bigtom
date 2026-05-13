import type { FilteringStatsResponse } from "../utils/types";

export const filteringStatsMock: FilteringStatsResponse = {
  status: "filtering_done",
  filterStats: {
    steps: [
      {
        name: "Qualitätsfilter",
        probesBefore: 500000,
        removed: 12000,
        probesAfter: 488000,
      },
      {
        name: "Sample-Fehler",
        probesBefore: 488000,
        removed: 3000,
        probesAfter: 485000,
      },
    ],
    finalProbeCount: 485000,
  },
};
