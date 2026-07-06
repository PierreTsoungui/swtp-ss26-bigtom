import { JobPhase, type JobStatus, JobStatusValue } from "../../../shared/types/JobTypes";
import type { BatchErrorDetail } from "../types";

/**
 * Pure, framework-agnostic derivations of the batch page's UI state from a
 * {@link JobStatus} or {@link BatchErrorDetail}.
 *
 * The batch page reacts to the polled job status to drive the progress bar and
 * to navigate onward once downstream analysis is done. Keeping those decisions
 * here — as small pure functions — makes the page component thin and each rule
 * individually unit-testable, mirroring the analysis feature's `analysisState`.
 */

/**
 * Error codes that represent an unrecoverable, page-level (system) failure as
 * opposed to a validation error that the user can correct in place.
 */
const SYSTEM_ERROR_CODES = ["BATCH_FAILED", "NETWORK_ERROR"] as const;

/**
 * Whether an error should be surfaced as a page-level system error banner.
 *
 * @param error - The latest batch error, or `null` if none occurred.
 * @returns `true` for unrecoverable system errors (failed correction, network).
 */
export function isSystemError(error: BatchErrorDetail | null): boolean {
  return error !== null && (SYSTEM_ERROR_CODES as readonly string[]).includes(error.error);
}

/**
 * Whether the downstream differential analysis (DMP/DMR) is currently running.
 *
 * @param status - The latest job status, or `null`.
 * @returns `true` while the analysis phase is running.
 */
export function isDownstreamRunning(status: JobStatus | null): boolean {
  return status?.phase === JobPhase.ANALYSIS && status.status === JobStatusValue.RUNNING;
}

/**
 * Whether the pipeline has reached the results stage and the user should be
 * navigated to the results page.
 *
 * @param status - The latest job status, or `null`.
 * @returns `true` once analysis has completed or the pipeline waits at results.
 */
export function hasReachedResults(status: JobStatus | null): boolean {
  if (!status) {
    return false;
  }

  return (
    (status.phase === JobPhase.ANALYSIS && status.status === JobStatusValue.COMPLETED) ||
    (status.phase === JobPhase.RESULTS && status.status === JobStatusValue.WAITING)
  );
}
