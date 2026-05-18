
export type NormalizationMethod =
  | "raw"
  | "noob"
  | "quantile"
  | "swan"
  | "funnorm";

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