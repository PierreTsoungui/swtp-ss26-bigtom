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

import type { ProblemDetail } from "../../../shared/error-handling/types/ErrorTypes";

export interface FilterStep {
  name: string;
  removed: number;
}

export interface FilterStats {
  total_before: number;
  steps: FilterStep[];
  remaining: number;
}

export interface FilteringStep {
  name: string;
  probesBefore: number;
  removed: number;
  probesAfter: number;
}

export interface FilteringStatsType {
  steps: FilteringStep[];
  finalProbeCount: number;
}

export type FilteringStatsStatus = "idle" | "filtering" | "filtering_done" | "error";

export interface FilteringStatsResponse {
  status: FilteringStatsStatus;
  filterStats?: FilteringStatsType;
  error?: string;
}

export type JobStatusValue =
  | "queued"
  | "running"
  | "waiting"
  | "filtering"
  | "filtering_done"
  | "normalization_done"
  | "completed"
  | "failed"
  | "canceled";

export type JobPhase =
  | "uploaded"
  | "validating"
  | "converting"
  | "filtering"
  | "normalization_preview"
  | "waiting_selection"
  | "normalizing"
  | "batch_correction"
  | "completed"
  | "reset";

export interface JobStatus {
  job_id: string;
  status: JobStatusValue;
  phase: JobPhase;
  progress_percent: number;
  current_step: string;
  steps_total: number;
  steps_completed: number;
  filter_stats: FilterStats | null;
  estimated_seconds_remaining: number | null;
  error?: ProblemDetail;
}

export type ResultsTableCellValue = string | number | null;

export interface ResultsTableResponse {
  columns: string[];
  rows: Array<Record<string, ResultsTableCellValue>>;
  page: number;
  page_size: number;
  total_rows: number;
}

export type SortOrder = "asc" | "desc";

export interface ResultsTableSorting {
  column: string;
  order: SortOrder;
}

export type ResetStatusTpe = {
  reset: boolean;
  status: JobStatusValue;
}


// Typdefinition für eine einzelne Methylierungs-Zeile
export type MethylationRow = {
  cpgId: string;           // ID des CpG-Sites
  geneSymbol: string;      // Name des zugehörigen Gens
  deltaBeta: number;       // Differenz der Beta-Werte (behandelt vs. Kontrolle)
  pValue: number;          // Statistische Signifikanz
  region: string;          // Genregion (Promotor, Körper, etc.)
  status: string;          // Status (signifikant/nicht signifikant)
  chromosome: string;      // Chromosomen-Nummer
  position: number;        // Genomische Position
  geneDescription?: string; // Optionale Genbeschreibung
};
