/**
 * Configuration for the batch effect correction algorithm.
 */
export interface BatchSettings {
  /** The primary technical variable to be corrected (e.g., 'Batch', 'Plate'). */
  batch_variable: string;
  /** Additional biological or technical variables to be preserved during correction. */
  covariates: string[];
}

/**
 * Metadata column information used for role assignment and group selection.
 */
export interface SampleSheetColumn {
  name: string;
  /** Number of unique levels/groups within this column. */
  levels: number;
  /** Distinct values in the column (used to pick case/control). */
  values: string[];
}

/**
 * Server response containing available metadata for batch parameter selection.
 */
export interface BatchParametersResponse {
  job_id: string;
  /** Detailed information for all identified metadata columns. */
  columns: SampleSheetColumn[];
  /** Simplified list of column names for backward compatibility. */
  available_columns: string[];
}


export interface BatchFormData {
  batch_variable: string;
  covariates: string[];
}

/**
 * Parameters for the Differential Methylation Analysis (DMP/DMR).
 * Defines which groups are compared to calculate the Delta Beta (case − control).
 */
export interface GroupSelection {
  /** The metadata column containing the biological groups. */
  group_column: string;
  /** The value representing the experimental group. */
  case_group: string;
  /** The value representing the baseline/reference group. */
  control_group: string;
}

/**
 * A single iteration of the batch correction workflow.
 */
export interface BatchRound {
  /** The sequence number of the correction step. */
  round: number;
  /** ISO timestamp of when this round was processed. */
  timestamp: string;
  /** 'initial' for the raw data preview, 'correction' for subsequent steps. */
  type: 'initial' | 'correction';
  /** Path to the SVD heatmap image. Append `?format=pdf` for high-quality export. */
  svd_plot: string;
  /** The parameters used for this specific correction round. */
  settings_used: BatchSettings | null;
}

/**
 * Full audit trail of all batch correction attempts and current state.
 */
export interface BatchHistoryResponse {
  job_id: string;
  /** List of all performed correction rounds including SVD plots. */
  rounds: BatchRound[];
  /** The index of the most recent round. */
  current_round: number;
  /** Indicates if at least one correction has been successfully applied. */
  correction_applied: boolean;
}

/**
 * Tabular data fragment for metadata preview.
 */
export interface SampleSheetPreview {
  job_id: string;
  columns: string[];
  rows: string[][];
  total_rows: number;
  /** True if the result was limited to prevent excessive data transfer. */
  truncated: boolean;
}

/**
 * Structured error details for failed batch operations.
 */
export interface BatchErrorDetail {
  /** Short machine-readable error code. */
  error: string;
  /** Human-readable error summary. */
  message: string;
  /** Specific context about provided vs. available metadata fields. */
  detail?: {
    provided?: string;
    available?: string[];
    provided_batch_variable?: string;
    provided_covariates?: string[];
  };
}
