// app/src/features/analysis/mocks/methylationMock.ts

export type MethylationRow = {
  cpgId: string;
  geneSymbol: string;
  deltaBeta: number;
  pValue: number;
  region: string;
  status: string;
  chromosome: string;
  position: number;
  geneDescription?: string;
};

// Colonnes au format API
export const methylationColumns = [
  { key: "cpgId", label: "CpG ID" },
  { key: "geneSymbol", label: "Gen Symbol" },
  { key: "deltaBeta", label: "Δβ" },
  { key: "pValue", label: "p-Wert" },
  { key: "region", label: "Region" },
  { key: "status", label: "Status" },
];

// Générer des données mock
const generateMockRows = (count: number): MethylationRow[] => {
  const genes = ["NFIX", "BDNF", "FMR1", "MECP2", "DNMT3A", "TET2", "IGF2", "SOX2", "BRCA1", "TP53"];
  const regions = ["Promotor", "Körper", "5'UTR", "Intron", "Exon"];

  return Array.from({ length: count }, (_, i) => ({
    cpgId: `cg${Math.floor(Math.random() * 10000000000)}`,
    geneSymbol: genes[i % genes.length],
    deltaBeta: parseFloat((Math.random() * 1.2 - 0.6).toFixed(2)),
    pValue: Math.pow(10, -Math.random() * 8),
    region: regions[i % regions.length],
    status: "signifikant",
    chromosome: String(Math.floor(Math.random() * 22) + 1),
    position: Math.floor(Math.random() * 200000000),
    geneDescription: `${genes[i % genes.length]} - Beschreibung`,
  }));
};

// EXPORTER CETTE CONSTANTE (c'est celle qu'on utilise dans tabellePage.tsx)
export const methylationRows: MethylationRow[] = generateMockRows(100);

export const statsMock = {
  totalCpgs: 865432,
  significantCpgs: 4058,
  meanDeltaBeta: 0.47,
};
