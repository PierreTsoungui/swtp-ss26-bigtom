import type { ProblemDetail } from "../errors/ErrorTypes.ts";

/**
 * Execution states for a processing job, indicating its current status in the workflow.
 */
export const JobStatusValue = {
  /** The job is actively being processed by the backend and r-backend. */
  RUNNING: "running",
  /** The job is paused and requires user interaction (e.g., confirming normalization parameters). */
  WAITING: "waiting",
  /** The job finished successfully and results are available. */
  COMPLETED: "completed",
  /** The job stopped due to a technical error. */
  FAILED: "failed",
} as const;

/** Type representing the valid values of {@link JobStatusValue}. */
export type JobStatusValue = (typeof JobStatusValue)[keyof typeof JobStatusValue];

/**
 * Sequential processing stages of the analysis pipeline.
 */
export const JobPhase = {
  /** Files have been received and are being validated. */
  UPLOADED: "uploaded",
  /** Removal of low-quality probes and samples. */
  FILTERING: "filtering",
  /** Generating a preview of the data distribution before final normalization. */
  NORMALIZATION_PREVIEW: "normalization_preview",
  /** Applying the selected normalization algorithm to the full dataset. */
  NORMALIZATION: "normalization",
  /** Generating SVD plots to visualize sources of variation in the data. */
  SVD: "svd",
  /** Adjusting for systematic technical variation (batch effects). */
  BATCH: "batch",
  /** Final statistical calculations and differential methylation testing. */
  ANALYSIS: "analysis",
  /** Preparing final tables and data exports. */
  RESULTS: "results",
  /** Generating interactive visualizations and heatmaps. */
  HEATMAP: "heatmap",
} as const;

/** Type representing the valid values of {@link JobPhase}. */
export type JobPhase = (typeof JobPhase)[keyof typeof JobPhase];

/**
 * Comprehensive status information for a processing job.
 */
export interface JobStatus {
  /** Unique identifier for the job. */
  job_id: string;
  /** The current execution state. */
  status: JobStatusValue;
  /** The current processing stage in the analysis pipeline. */
  phase: JobPhase;
  /** Current progress in percent (0 to 100). */
  progress_percent: number;
  /** Human-readable label for the current sub-step (e.g., "Calculating P-Values"). */
  current_step: string;
  /** Contains error details if status is {@link JobStatusValue.FAILED}. */
  error?: ProblemDetail | null;
}
