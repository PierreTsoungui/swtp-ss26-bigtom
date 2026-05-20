/**
 * Beschreibt die 4 Normalisierungsmethoden, die in der Normalisierungsphase zur Auswahl stehen.
 * Die fünfte Methode "raw" ist die Option, keine Normalisierung durchzuführen und die Rohdaten zu verwenden.
 * Diese Typdefinition wird verwendet, um die Auswahlmöglichkeiten in der UI zu typisieren und sicherzustellen,
 * dass nur gültige Normalisierungsmethoden verwendet werden können.
 */
export type NormalizationMethod =
  | "raw"
  | "noob"
  | "quantile"
  | "swan"
  | "funnorm";


/**
 *
 */
export interface NormalizationMethodPlot {
    method: NormalizationMethod;
    url: string;       //  url wird gesendet
    quality_score?: number;    // nur bei non-raw Methoden
    density_data?: unknown;    // nur bei raw
}

export interface NormalizationPreview {
    plots: NormalizationMethodPlot[];
    recommendation: NormalizationMethod;
}