import { describe, expect, it } from "vitest";

import { JobPhase, type JobStatus, JobStatusValue } from "@shared/types/JobTypes.ts";
import type { BatchErrorDetail } from "../types";
import { hasReachedResults, isDownstreamRunning, isSystemError } from "./batchState";

/** Builds a job status with sensible defaults, overridable per test. */
function status(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "job-1",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.BATCH,
    progress_percent: 0,
    current_step: "step",
    ...overrides,
  };
}

describe("isSystemError", () => {
  it("is false without an error", () => {
    expect(isSystemError(null)).toBe(false);
  });

  it("is true for unrecoverable system error codes", () => {
    for (const code of ["BATCH_FAILED", "NETWORK_ERROR"]) {
      const error: BatchErrorDetail = { error: code, message: "boom" };
      expect(isSystemError(error)).toBe(true);
    }
  });

  it("is false for recoverable/validation error codes", () => {
    expect(isSystemError({ error: "INVALID_BATCH_VARIABLE", message: "x" })).toBe(false);
    expect(isSystemError({ error: "SKIP_FAILED", message: "x" })).toBe(false);
  });
});

describe("isDownstreamRunning", () => {
  it("is false without a status", () => {
    expect(isDownstreamRunning(null)).toBe(false);
  });

  it("is true only while the analysis phase is running", () => {
    expect(
      isDownstreamRunning(status({ phase: JobPhase.ANALYSIS, status: JobStatusValue.RUNNING })),
    ).toBe(true);
    expect(
      isDownstreamRunning(status({ phase: JobPhase.ANALYSIS, status: JobStatusValue.COMPLETED })),
    ).toBe(false);
    expect(
      isDownstreamRunning(status({ phase: JobPhase.BATCH, status: JobStatusValue.RUNNING })),
    ).toBe(false);
  });
});

describe("hasReachedResults", () => {
  it("is false without a status", () => {
    expect(hasReachedResults(null)).toBe(false);
  });

  it("is true once analysis completed or the pipeline waits at results", () => {
    expect(
      hasReachedResults(status({ phase: JobPhase.ANALYSIS, status: JobStatusValue.COMPLETED })),
    ).toBe(true);
    expect(
      hasReachedResults(status({ phase: JobPhase.RESULTS, status: JobStatusValue.WAITING })),
    ).toBe(true);
  });

  it("is false while analysis is still running or before it starts", () => {
    expect(
      hasReachedResults(status({ phase: JobPhase.ANALYSIS, status: JobStatusValue.RUNNING })),
    ).toBe(false);
    expect(
      hasReachedResults(status({ phase: JobPhase.BATCH, status: JobStatusValue.WAITING })),
    ).toBe(false);
  });
});
