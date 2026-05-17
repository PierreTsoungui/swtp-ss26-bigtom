import type { ResultsTableResponse } from "../utils/types";

export const resultsTableMock: ResultsTableResponse = {
  columns: ["CpG", "Chromosome", "BetaValue"],
  rows: [
    {
      CpG: "cg000001",
      Chromosome: "chr1",
      BetaValue: 0.82,
    },
    {
      CpG: "cg000002",
      Chromosome: "chr2",
      BetaValue: 0.41,
    },
    {
      CpG: "cg000003",
      Chromosome: "chr7",
      BetaValue: null,
    },
  ],
  page: 1,
  page_size: 100,
  total_rows: 500000,
};
