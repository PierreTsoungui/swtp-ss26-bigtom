import { describe, expect, it } from "vitest";

import { shouldNavigateToBatch } from "./normalizationState";
import { JobPhase, type JobStatus, JobStatusValue } from "../../../shared/types/JobTypes";

/** Builds a job status with sensible defaults, overridable per test. */
function status(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "job-1",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.NORMALIZATION,
    progress_percent: 0,
    current_step: "step",
    ...overrides,
  };
}

describe("shouldNavigateToBatch", () => {
  it("is false without a status", () => {
    expect(shouldNavigateToBatch(null)).toBe(false);
  });

  it("is true only when the pipeline waits at the batch phase", () => {
    expect(
      shouldNavigateToBatch(status({ phase: JobPhase.BATCH, status: JobStatusValue.WAITING })),
    ).toBe(true);
  });

  it("is false while batch is running or in another phase", () => {
    expect(
      shouldNavigateToBatch(status({ phase: JobPhase.BATCH, status: JobStatusValue.RUNNING })),
    ).toBe(false);
    expect(
      shouldNavigateToBatch(
        status({ phase: JobPhase.NORMALIZATION, status: JobStatusValue.WAITING }),
      ),
    ).toBe(false);
    expect(
      shouldNavigateToBatch(status({ phase: JobPhase.SVD, status: JobStatusValue.WAITING })),
    ).toBe(false);
  });
});
