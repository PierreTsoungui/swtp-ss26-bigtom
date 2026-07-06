import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isTerminalState, useJobPolling } from "./useJobPolling";
import { JobPhase, type JobStatus, JobStatusValue } from "../types/JobTypes";

function statusBody(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "job-1",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.FILTERING,
    progress_percent: 10,
    current_step: "filtering",
    ...overrides,
  };
}

function jsonResponse(body: unknown, ok = true, statusCode = 200): Response {
  return { ok, status: statusCode, json: () => Promise.resolve(body) } as Response;
}

describe("isTerminalState", () => {
  it("is terminal whenever the job has failed", () => {
    expect(isTerminalState(JobPhase.FILTERING, JobStatusValue.FAILED)).toBe(true);
  });

  it("is terminal at user-decision waits and after the heatmap", () => {
    expect(isTerminalState(JobPhase.NORMALIZATION, JobStatusValue.WAITING)).toBe(true);
    expect(isTerminalState(JobPhase.BATCH, JobStatusValue.WAITING)).toBe(true);
    expect(isTerminalState(JobPhase.RESULTS, JobStatusValue.WAITING)).toBe(true);
    expect(isTerminalState(JobPhase.HEATMAP, JobStatusValue.COMPLETED)).toBe(true);
  });

  it("is not terminal while work is running or progressing", () => {
    expect(isTerminalState(JobPhase.FILTERING, JobStatusValue.RUNNING)).toBe(false);
    expect(isTerminalState(JobPhase.BATCH, JobStatusValue.RUNNING)).toBe(false);
    expect(isTerminalState(JobPhase.HEATMAP, JobStatusValue.RUNNING)).toBe(false);
  });
});

describe("useJobPolling", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not poll when the job id is null", () => {
    const { result } = renderHook(() => useJobPolling(null));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toBeNull();
  });

  it("returns the parsed status and stops at a terminal state", async () => {
    const body = statusBody({ phase: JobPhase.HEATMAP, status: JobStatusValue.COMPLETED });
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(body));

    const { result } = renderHook(() => useJobPolling("job-1"));

    await waitFor(() => expect(result.current).toEqual(body));
    expect(fetch).toHaveBeenCalledWith("/api/v1/status/job-1");
    // Terminal state → no follow-up request scheduled.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("maps the parsed error detail onto the status", async () => {
    const problem = { title: "Boom", status: 500, detail: "kaboom", instance: "/x" };
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(statusBody({ status: JobStatusValue.FAILED, error: problem })),
    );

    const { result } = renderHook(() => useJobPolling("job-1"));

    await waitFor(() => expect(result.current?.error).toEqual(problem));
  });

  it("marks the job as failed after the maximum consecutive request failures", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(statusBody({ status: JobStatusValue.RUNNING })))
      .mockRejectedValue(new Error("connection lost"));

    const { result } = renderHook(() => useJobPolling("job-1"));

    // Flush the initial (non-timer) poll's promise chain → running, next scheduled.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current?.status).toBe(JobStatusValue.RUNNING);

    // Three consecutive failures (base + linear backoff) trip the failure limit.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000 + 3000 + 6000);
    });

    expect(result.current?.status).toBe(JobStatusValue.FAILED);
    expect(result.current?.error?.title).toBe("Connection error");
  });
});
