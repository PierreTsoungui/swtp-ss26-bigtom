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

export type FilteringStatsStatus = "filtering" | "filtering_done";

export interface FilteringStats {
  totalProbes: number;
  removedLowQuality: number;
  removedFailedSamples: number;
  remaining: number;
}

export interface FilteringStatsResponse {
  status: FilteringStatsStatus;
  filterStats: FilteringStats;
}

export type JobStatusValue =
  | "queued"
  | "running"
  | "waiting"
  | "filtering"
  | "filtering_done"
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
