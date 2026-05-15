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

export interface FilteringStats {
  steps: FilteringStep[];
  finalProbeCount: number;
}

export type FilteringStatsStatus = "idle" | "filtering" | "filtering_done" | "error";

export interface FilteringStatsResponse {
  status: FilteringStatsStatus;
  filterStats?: FilteringStats;
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
