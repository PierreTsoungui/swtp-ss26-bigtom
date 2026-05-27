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



export interface NormalizationPreview {
    plots: MethodPlotGroup[];
    recommendation: NormalizationMethod;
}


export interface PlotItem {
  plot_kind: "density" | "pca";
  url: string;
}

export interface MethodPlotGroup {
  method: NormalizationMethod;
  plots: PlotItem[];

}