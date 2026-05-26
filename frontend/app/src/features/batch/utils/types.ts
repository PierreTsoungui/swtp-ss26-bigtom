export interface BatchSettings {
  batch_variable: string;
  covariates: string[];
}

export interface BatchRound {
  round: number;
  timestamp: string;
  type: 'initial' | 'correction';
  svd_plot: string;
  settings_used: BatchSettings | null;
}

export interface BatchHistoryResponse {
  job_id: string;
  rounds: BatchRound[];
  current_round: number;
  correction_applied: boolean;
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