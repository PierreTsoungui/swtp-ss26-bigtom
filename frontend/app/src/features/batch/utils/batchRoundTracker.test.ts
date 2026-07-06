import { describe, it, expect } from "vitest";

import { BatchRoundTracker } from "./batchRoundTracker";
import { JobPhase, JobStatusValue, type JobStatus } from "../../../shared/types/JobTypes.ts";

/** Build a minimal JobStatus for a given phase/status. */
const mk = (phase: JobPhase, status: JobStatusValue): JobStatus => ({
  job_id: "job-1",
  phase,
  status,
  progress_percent: 0,
  current_step: "",
});

const RUNNING = mk(JobPhase.BATCH, JobStatusValue.RUNNING);
const WAITING = mk(JobPhase.BATCH, JobStatusValue.WAITING);

describe("BatchRoundTracker", () => {
  it("reports completion only after the round was seen running", () => {
    const t = new BatchRoundTracker();
    t.startRound();

    expect(t.observe(RUNNING)).toBe(false); // running -> not finished yet
    expect(t.observe(WAITING)).toBe(true); // now the WAITING ends the round
  });

  it("ignores a stale WAITING seen before the round has run (the round-2+ bug)", () => {
    const t = new BatchRoundTracker();

    // Round 1 runs to completion.
    t.startRound();
    t.observe(RUNNING);
    expect(t.observe(WAITING)).toBe(true);

    // Round 2 starts while the previous round's WAITING is still being polled.
    t.startRound();
    // This leftover WAITING must NOT be treated as "round 2 finished"...
    expect(t.observe(WAITING)).toBe(false);
    // ...only after round 2 is actually seen running does WAITING end it.
    t.observe(RUNNING);
    expect(t.observe(WAITING)).toBe(true);
  });

  it("does not re-report completion for the same lingering WAITING", () => {
    const t = new BatchRoundTracker();
    t.startRound();
    t.observe(RUNNING);

    expect(t.observe(WAITING)).toBe(true); // finishes the round
    expect(t.observe(WAITING)).toBe(false); // subsequent polls are idle, not finished
  });

  it("treats each round independently", () => {
    const t = new BatchRoundTracker();

    for (let round = 0; round < 3; round++) {
      t.startRound();
      expect(t.observe(WAITING)).toBe(false); // stale/idle before running
      t.observe(RUNNING);
      expect(t.observe(WAITING)).toBe(true); // genuine completion
    }
  });

  it("does not mistake a non-batch status for a batch completion", () => {
    const t = new BatchRoundTracker();
    t.startRound();
    t.observe(RUNNING);

    expect(t.observe(mk(JobPhase.ANALYSIS, JobStatusValue.WAITING))).toBe(false);
    expect(t.observe(mk(JobPhase.RESULTS, JobStatusValue.WAITING))).toBe(false);
  });
});
