
export type NormalizationMethod = "raw" | "funnorm" | "bmiq" | "dasen";

export interface NormalizationMethodPlot {
    method: NormalizationMethod;
    plot_base64: string;       // PNG als Base64
    quality_score?: number;    // nur bei non-raw Methoden
    density_data?: unknown;    // nur bei raw
}

export interface NormalizationPreview {
    methods: NormalizationMethod[];
    plots: Record<NormalizationMethod, NormalizationMethodPlot>;
    recommendation: NormalizationMethod;
}