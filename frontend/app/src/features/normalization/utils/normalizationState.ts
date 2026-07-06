import { JobPhase, type JobStatus, JobStatusValue } from "../../../shared/types/JobTypes";

/**
 * Pure derivations of the normalization page's navigation state from a polled
 * {@link JobStatus}. Keeping the rule here makes it unit-testable and keeps the
 * page's effect a thin wiring of decision → action.
 */

/**
 * Whether the pipeline has advanced past normalization and is now waiting for
 * the user at the batch-correction step.
 *
 * After normalization completes, the backend runs SVD round 0 and then parks the
 * job at `batch/waiting`; that is the point at which the frontend hands off to
 * the batch page.
 *
 * @param status - The latest job status, or `null` if none has been received.
 * @returns `true` when the user should be navigated to the batch page.
 */
export function shouldNavigateToBatch(status: JobStatus | null): boolean {
  return status?.phase === JobPhase.BATCH && status.status === JobStatusValue.WAITING;
}
