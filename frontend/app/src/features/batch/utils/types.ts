export interface BatchSettings {
  batch_variable: string;
  covariates: string[];
}

/** A sample-sheet column the user can assign a role to, with its level count. */
export interface SampleSheetColumn {
  name: string;
  levels: number;
  /** Distinct values in the column (used to pick case/control). */
  values: string[];
}

export interface BatchParametersResponse {
  job_id: string;
  /** All columns that group the samples — offered for both roles. */
  columns: SampleSheetColumn[];
  /** Flat list of the same names (backward compatible). */
  available_columns: string[];
}

export interface BatchFormData {
  batch_variable: string;
  covariates: string[];
}

/** Comparison for the DMP/DMR analysis (deterministic Δβ = case − control). */
export interface GroupSelection {
  group_column: string;
  case_group: string;
  control_group: string;
}

export interface BatchRound {
  round: number;
  timestamp: string;
  type: 'initial' | 'correction';
  /** URL of the static SVD heatmap (PNG); append ?format=pdf for the download. */
  svd_plot: string;
  settings_used: BatchSettings | null;
}

export interface BatchHistoryResponse {
  job_id: string;
  rounds: BatchRound[];
  current_round: number;
  correction_applied: boolean;
}

export interface SampleSheetPreview {
  job_id: string;
  columns: string[];
  rows: string[][];
  total_rows: number;
  truncated: boolean;
}

export interface BatchErrorDetail {
  error: string;
  message: string;
  detail?: {
    provided?: string;
    available?: string[];
    provided_batch_variable?: string;
    provided_covariates?: string[];
  };
}
