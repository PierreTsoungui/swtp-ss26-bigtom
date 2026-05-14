export type AnalysisStatus =
  | "Abgeschlossen"
  | "Validiert"
  | "In Bearbeitung";

export type AnalysisRow = {
  id: string;
  concentration: number;
  unit: string;
  date: string;
  status: AnalysisStatus;
};

export const analysisMock = {
  columns: [
    "Proben-ID",
    "Konzentration",
    "Einheit",
    "Datum",
    "Status",
  ],

  rows: Array.from({ length: 50 }, (_, i): AnalysisRow => ({
    id: `PROBE-${i + 1}`,
    concentration: Math.random() * 100,
    unit: "µg/L",
    date: "2025-05-14",
    status: ["Abgeschlossen", "Validiert", "In Bearbeitung"][
      i % 3
    ] as AnalysisStatus,
  })),
};
