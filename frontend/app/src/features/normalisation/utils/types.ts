/**
 * Die fünf Normalisierungs-Optionen, die in der Preview zur Auswahl stehen.
 * "raw" = keine Normalisierung (Rohdaten).
 */
export type NormalizationMethod =
  | "raw"
  | "noob"
  | "quantile"
  | "swan"
  | "funnorm";

/**
 * Feste Reihenfolge der Methoden-Spalten in der Preview. RAW steht ganz links
 * (NRM-01), danach die Normalisierungsmethoden in fachlich üblicher Folge.
 */
export const METHOD_ORDER: NormalizationMethod[] = [
  "raw",
  "noob",
  "quantile",
  "swan",
  "funnorm",
];

/** Ein einzelner PCA-Punkt (ein Sample) aus dem Backend. */
export interface PcaPoint {
  sample: string;
  /** Sample-Gruppe (Phänotyp); leerer String wenn unbekannt. */
  group: string;
  pc1: number;
  pc2: number;
}

/** PCA-Daten einer Methode (JSON statt PNG, für den interaktiven Plotter). */
export interface PcaData {
  method?: string;
  axes?: { x: string; y: string };
  variance_explained?: { pc1: number; pc2: number };
  points: PcaPoint[];
  /** Gesetzt, wenn die PCA für diese Methode fehlgeschlagen ist. */
  error?: string;
}

/** Vorschau einer Methode: statischer Density-Plot + dynamische PCA-Daten. */
export interface MethodPreview {
  method: NormalizationMethod;
  density_url: string | null;
  pca: PcaData | null;
}

/** Antwort des Preview-Endpunkts. */
export interface NormalizationPreview {
  job_id: string;
  methods: MethodPreview[];
}
