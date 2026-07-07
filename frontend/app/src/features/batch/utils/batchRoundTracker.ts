import { JobPhase, JobStatusValue, type JobStatus } from "@shared/types/JobTypes.ts";

/**
 * Tracks a single batch-correction round so the UI can tell a *genuine*
 * completion apart from a stale status left over from a previous round.
 *
 * Background: the job status polled from the backend stays at
 * `BATCH + WAITING` after a round finishes (the job waits for the next user
 * action). When the user starts the next round, that stale `WAITING` is still
 * present for one render while the progress bar is switched on — which used to
 * be misread as "this new round already finished", instantly hiding the
 * progress bar (the "round 2+ shows no progress bar" bug).
 *
 * Rule enforced here: a round only counts as finished once it has actually been
 * observed `RUNNING` since it started. A leftover `WAITING` therefore cannot end
 * a freshly started round.
 *
 * Usage: call {@link startRound} when the user submits a round, then feed every
 * polled status into {@link observe}; it returns `true` exactly on the status
 * that ends the current round.
 */
export class BatchRoundTracker {
  private runObserved = false;

  /** Begin a new round: any status seen before the next `RUNNING` is stale. */
  startRound(): void {
    this.runObserved = false;
  }

  /**
   * Feed a polled job status in.
   * @returns `true` exactly when this status marks the end of the current round.
   */
  observe(job: JobStatus): boolean {
    if (job.phase === JobPhase.BATCH && job.status === JobStatusValue.RUNNING) {
      this.runObserved = true;
    }

    const finished =
      job.phase === JobPhase.BATCH && job.status === JobStatusValue.WAITING && this.runObserved;

    if (finished) {
      // Consume the completion so the same lingering WAITING is not reported
      // again on the next poll of the (now idle) job.
      this.runObserved = false;
    }
    return finished;
  }
}
