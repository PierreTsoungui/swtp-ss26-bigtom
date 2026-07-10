import { JobPhase, type JobStatus, JobStatusValue } from "@shared/types/JobTypes.ts";

/**
 * Pure, framework-agnostic derivations of the analysis page's UI state from a
 * {@link JobStatus}.
 *
 * The analysis page renders very different things depending on the exact
 * `(phase, status)` combination reported by the backend. Keeping that decision
 * logic here — as small pure functions — makes the page component thin, makes
 * each rule individually unit-testable, and removes the risk of the same
 * condition being written slightly differently in two places.
 */

/**
 * Whether the filtering statistics are available for the given job state.
 *
 * The statistics are produced when filtering completes and remain available for
 * every subsequent phase, so the page can request them once (keyed by job id)
 * and keep them as the pipeline progresses. They are not yet available while
 * files are still being uploaded or while filtering is running.
 *
 * @param status - The latest job status, or `null` if none has been received.
 * @returns `true` if the filtering statistics can be requested and displayed.
 */
export function filterStatsAvailable(status: JobStatus | null): boolean {
  if (!status || status.phase === JobPhase.UPLOADED) {
    return false;
  }

  if (status.phase === JobPhase.FILTERING) {
    return status.status === JobStatusValue.COMPLETED;
  }

  return true;
}

/**
 * Whether the normalization preview is ready and the user may proceed.
 *
 * @param status - The latest job status, or `null`.
 * @returns `true` once the preview has completed or the pipeline is waiting for
 *   the user to pick a normalization method.
 */
export function isPreviewReady(status: JobStatus | null): boolean {
  if (!status) {
    return false;
  }

  return (
    (status.phase === JobPhase.NORMALIZATION_PREVIEW &&
      status.status === JobStatusValue.COMPLETED) ||
    (status.phase === JobPhase.NORMALIZATION && status.status === JobStatusValue.WAITING)
  );
}

/**
 * Whether the progress bar (including the "Next" action) should be shown.
 *
 * @param status - The latest job status, or `null`.
 * @returns `true` while filtering or the preview is running/completing, or once
 *   the pipeline is waiting at the normalization step.
 */
export function shouldShowProgress(status: JobStatus | null): boolean {
  if (!status) {
    return false;
  }

  return (
    (status.phase === JobPhase.FILTERING && status.status === JobStatusValue.RUNNING) ||
    (status.phase === JobPhase.NORMALIZATION_PREVIEW &&
      (status.status === JobStatusValue.RUNNING || status.status === JobStatusValue.COMPLETED)) ||
    (status.phase === JobPhase.NORMALIZATION && status.status === JobStatusValue.WAITING)
  );
}

/**
 * Whether the job has failed.
 *
 * @param status - The latest job status, or `null`.
 * @returns `true` if the job's status is `FAILED`.
 */
export function hasFailed(status: JobStatus | null): boolean {
  return status?.status === JobStatusValue.FAILED;
}

/**
 * Resolves a human-readable failure message from a job status.
 *
 * Prefers the structured error detail, then the current step label, and finally
 * the supplied fallback.
 *
 * @param status - The failed job status, or `null`.
 * @param fallback - Message to use when no detail is available.
 * @returns The best available message describing the failure.
 */
export function resolveErrorMessage(status: JobStatus | null, fallback: string): string {
  return status?.error?.detail || status?.current_step || fallback;
}
