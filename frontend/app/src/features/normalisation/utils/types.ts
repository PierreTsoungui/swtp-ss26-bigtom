/**
 * Available normalization algorithms for the analysis pipeline.
 * 'raw' represents the unnormalized baseline data.
 */
export type NormalizationMethod =
    | "raw"
    | "noob"
    | "quantile"
    | "swan"
    | "funnorm";

/**
 * Defines the canonical display order for method comparison.
 * 'raw' is positioned first (left) to serve as a baseline reference.
 */
export const METHOD_ORDER: NormalizationMethod[] = [
  "raw",
  "noob",
  "quantile",
  "swan",
  "funnorm",
];

/**
 * Represents a single sample in a 2D PCA coordinate system.
 */
export interface PcaPoint {
  /** Unique sample identifier. */
  sample: string;
  /** Sample group or phenotype; empty string if unknown. */
  group: string;
  /** Value of the first principal component. */
  pc1: number;
  /** Value of the second principal component. */
  pc2: number;
}

/**
 * Structured PCA results for interactive visualization.
 */
export interface PcaData {
  method?: string;
  /** Axis labels, typically 'PC1' and 'PC2'. */
  axes?: { x: string; y: string };
  /** Percentage of variance captured by the primary components. */
  variance_explained?: { pc1: number; pc2: number };
  points: PcaPoint[];
  /** Contains an error message if the PCA calculation failed for this specific method. */
  error?: string;
}

/**
 * Comparative preview data for a normalization method.
 * Includes a static density plot URL and dynamic data for PCA plotting.
 */
export interface MethodPreview {
  method: NormalizationMethod;
  /** URL to the generated density plot (PNG). Null if generation failed. */
  density_url: string | null;
  /** PCA dataset for interactive exploration. Null if calculation failed. */
  pca: PcaData | null;
}

/**
 * Server response containing all generated normalization previews for a job.
 */
export interface NormalizationPreview {
  job_id: string;
  methods: MethodPreview[];
}
