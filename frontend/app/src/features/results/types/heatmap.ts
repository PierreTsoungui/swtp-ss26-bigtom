/**
 * Domain types for the heatmap API.
 *
 * The heatmap synchronizes with the DMP (Differentially Methylated Positions)
 * table filters to ensure data consistency across views.
 */

/**
 * Grouping parameters for metadata annotation bars in the heatmap.
 */
export type HeatMapGrouping = {
  /** Primary metadata variable used for sample clustering/sorting. */
  primary: string;
  /** Optional secondary variable for nested annotation. */
  secondary?: string;
};

/**
 * Request body for generating a heatmap.
 * @param filters - A key-value map of applied DMP table filters.
 * @param grouping - Configuration for the horizontal annotation bars.
 */
export type HeatMapRequest = {
  filters: Record<string, string>;
  grouping: HeatMapGrouping;
};

/**
 * Technical summary of the generated heatmap.
 */
export type HeatMapMetadata = {
  /** Total number of CpG sites included in the plot. */
  detected_cpgs: number;
  /** Number of biological samples successfully plotted. */
  plotted_samples: number;
  /** Descriptive status message from the backend. */
  message: string;
};

/**
 * Response returned after a successful heatmap generation request.
 */
export type HeatMapResponse = {
  job_id: string;
  phase: string;
  status: string;
  heatmap_metadata: HeatMapMetadata;
};

/**
 * Metadata column available for heatmap annotation.
 */
export type AnnotationColumn = {
  name: string;
  /** Data type hint: 'categorical', 'continuous', or 'identifier'. */
  type: string;
  /** Number of unique values within the column. */
  n_distinct: number;
};

/**
 * Available metadata options for grouping and annotation.
 */
export type HeatMapOptionsResponse = {
  job_id: string;
  /** List of columns that can be used for the grouping dropdowns. */
  available_columns: AnnotationColumn[];
};

/**
 * Standardized error response for failed heatmap operations.
 */
export type HeatMapErrorResponse = {
  /** Short machine-readable error code. */
  error: string;
  /** Human-readable error summary. */
  message: string;
  /** Specific technical context or validation failure details. */
  detail?: string;
};
