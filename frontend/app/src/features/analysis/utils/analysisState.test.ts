import { describe, expect, it } from "vitest";
import { JobPhase, type JobStatus, JobStatusValue } from "@shared/types/JobTypes.ts";
import {
  filterStatsAvailable,
  hasFailed,
  isPreviewReady,
  resolveErrorMessage,
  shouldShowProgress,
} from "./analysisState";

/** Builds a job status with sensible defaults, overridable per test. */
function status(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "job-1",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.FILTERING,
    progress_percent: 0,
    current_step: "step",
    ...overrides,
  };
}

describe("filterStatsAvailable", () => {
  it("is false without a status", () => {
    expect(filterStatsAvailable(null)).toBe(false);
  });

  it("is false before and during filtering", () => {
    expect(
      filterStatsAvailable(status({ phase: JobPhase.UPLOADED, status: JobStatusValue.WAITING })),
    ).toBe(false);
    expect(
      filterStatsAvailable(status({ phase: JobPhase.FILTERING, status: JobStatusValue.RUNNING })),
    ).toBe(false);
  });

  it("is true once filtering has completed", () => {
    expect(
      filterStatsAvailable(status({ phase: JobPhase.FILTERING, status: JobStatusValue.COMPLETED })),
    ).toBe(true);
  });

  it("stays true for every phase after filtering", () => {
    for (const phase of [
      JobPhase.NORMALIZATION_PREVIEW,
      JobPhase.NORMALIZATION,
      JobPhase.BATCH,
      JobPhase.RESULTS,
    ]) {
      expect(filterStatsAvailable(status({ phase, status: JobStatusValue.RUNNING }))).toBe(true);
    }
  });
});

describe("isPreviewReady", () => {
  it("is false without a status", () => {
    expect(isPreviewReady(null)).toBe(false);
  });

  it("is true when the preview has completed", () => {
    expect(
      isPreviewReady(
        status({ phase: JobPhase.NORMALIZATION_PREVIEW, status: JobStatusValue.COMPLETED }),
      ),
    ).toBe(true);
  });

  it("is true when the pipeline waits at the normalization step", () => {
    expect(
      isPreviewReady(status({ phase: JobPhase.NORMALIZATION, status: JobStatusValue.WAITING })),
    ).toBe(true);
  });

  it("is false while the preview is still running", () => {
    expect(
      isPreviewReady(
        status({ phase: JobPhase.NORMALIZATION_PREVIEW, status: JobStatusValue.RUNNING }),
      ),
    ).toBe(false);
  });
});

describe("shouldShowProgress", () => {
  it("is false without a status", () => {
    expect(shouldShowProgress(null)).toBe(false);
  });

  it.each([
    [JobPhase.FILTERING, JobStatusValue.RUNNING, true],
    [JobPhase.FILTERING, JobStatusValue.COMPLETED, false],
    [JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.RUNNING, true],
    [JobPhase.NORMALIZATION_PREVIEW, JobStatusValue.COMPLETED, true],
    [JobPhase.NORMALIZATION, JobStatusValue.WAITING, true],
    [JobPhase.BATCH, JobStatusValue.RUNNING, false],
  ])("phase=%s status=%s -> %s", (phase, statusValue, expected) => {
    expect(shouldShowProgress(status({ phase, status: statusValue }))).toBe(expected);
  });
});

describe("hasFailed", () => {
  it("is true only for the failed status", () => {
    expect(hasFailed(status({ status: JobStatusValue.FAILED }))).toBe(true);
    expect(hasFailed(status({ status: JobStatusValue.RUNNING }))).toBe(false);
    expect(hasFailed(null)).toBe(false);
  });
});

describe("resolveErrorMessage", () => {
  it("prefers the structured error detail", () => {
    const failed = status({
      current_step: "step-label",
      error: { title: "T", status: 500, detail: "Detailed cause", instance: "/x" },
    });
    expect(resolveErrorMessage(failed, "fallback")).toBe("Detailed cause");
  });

  it("falls back to the current step when there is no error detail", () => {
    expect(
      resolveErrorMessage(status({ current_step: "step-label", error: null }), "fallback"),
    ).toBe("step-label");
  });

  it("uses the fallback when neither detail nor step is available", () => {
    expect(resolveErrorMessage(null, "fallback")).toBe("fallback");
    expect(resolveErrorMessage(status({ current_step: "", error: null }), "fallback")).toBe(
      "fallback",
    );
  });
});
