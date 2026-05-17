// app/src/features/analysis/data/methylationData.ts

// Typdefinition für eine einzelne Methylierungs-Zeile
export type MethylationRow = {
  cpgId: string;           // ID des CpG-Sites
  geneSymbol: string;      // Name des zugehörigen Gens
  deltaBeta: number;       // Differenz der Beta-Werte (behandelt vs. Kontrolle)
  pValue: number;          // Statistische Signifikanz
  region: string;          // Genregion (Promotor, Körper, etc.)
  status: string;          // Status (signifikant/nicht signifikant)
  chromosome: string;      // Chromosomen-Nummer
  position: number;        // Genomische Position
  geneDescription?: string; // Optionale Genbeschreibung
};

// Spaltendefinition im API-Format (wird später für Backend-Kommunikation genutzt)
export const methylationColumns = [
  { key: "cpgId", label: "CpG ID" },
  { key: "geneSymbol", label: "Gen Symbol" },
  { key: "deltaBeta", label: "Δβ" },
  { key: "pValue", label: "p-Wert" },
  { key: "region", label: "Region" },
  { key: "status", label: "Status" },
];

// Generiert eine bestimmte Anzahl an Mock-Daten für Testzwecke
// @param count - Anzahl der zu generierenden Zeilen
// @returns Array von MethylationRow-Objekten
const generateMockRows = (count: number): MethylationRow[] => {
  // Verfügbare Gennamen für realistische Mock-Daten
  const genes = ["NFIX", "BDNF", "FMR1", "MECP2", "DNMT3A", "TET2", "IGF2", "SOX2", "BRCA1", "TP53"];

  // Mögliche Genregionen
  const regions = ["Promotor", "Körper", "5'UTR", "Intron", "Exon"];

  return Array.from({ length: count }, (_, i) => ({
    cpgId: `cg${Math.floor(Math.random() * 10000000000)}`, // Zufällige CpG-ID
    geneSymbol: genes[i % genes.length],                    // Zyklische Gen-Zuweisung
    deltaBeta: parseFloat((Math.random() * 1.2 - 0.6).toFixed(2)), // Δβ zwischen -0.6 und +0.6
    pValue: Math.pow(10, -Math.random() * 8),               // p-Wert zwischen 1e-8 und 1e0
    region: regions[i % regions.length],                    // Zyklische Regions-Zuweisung
    status: "signifikant",                                   // Alle generierten CpGs sind signifikant
    chromosome: String(Math.floor(Math.random() * 22) + 1),  // Chromosom 1-22
    position: Math.floor(Math.random() * 200000000),        // Zufällige Position (0-200M)
    geneDescription: `${genes[i % genes.length]} - Beschreibung`, // Standard-Beschreibung
  }));
};

// Exportiert 100 Zeilen mit Mock-Daten für die Tabelle
// Wird in MethylationAnalysisPage.tsx verwendet
export const methylationRows: MethylationRow[] = generateMockRows(100);

// Statistische Kennzahlen für die Übersichtsanzeige
export const statsMock = {
  totalCpgs: 865432,        // Gesamtzahl aller untersuchten CpGs
  significantCpgs: 4058,    // Anzahl signifikant methylierter CpGs (p < 0.05)
  meanDeltaBeta: 0.47,      // Mittlere Beta-Differenz über alle CpGs
};
