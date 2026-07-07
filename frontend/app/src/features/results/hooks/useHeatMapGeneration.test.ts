import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useHeatMapGeneration } from "./useHeatMapGeneration";
import { useJobPolling } from "@shared/hooks/useJobPolling.ts";
import { useGenerateHeatMap } from "./useGenerateHeatMap";
import { JobPhase, type JobStatus, JobStatusValue } from "@shared/types/JobTypes.ts";
import type { HeatMapRequest } from "../types";

vi.mock("../../../shared/hooks/useJobPolling", () => ({ useJobPolling: vi.fn() }));
vi.mock("./useGenerateHeatMap", () => ({ useGenerateHeatMap: vi.fn() }));

const mockedPolling = vi.mocked(useJobPolling);
const mockedGenerate = vi.mocked(useGenerateHeatMap);
const generateHeatMap = vi.fn().mockResolvedValue(null);

const request: HeatMapRequest = {
  filters: { gene: "TP53" },
  grouping: { primary: "Sample_Group" },
};

function status(overrides: Partial<JobStatus> = {}): JobStatus {
  return {
    job_id: "job-1",
    status: JobStatusValue.RUNNING,
    phase: JobPhase.HEATMAP,
    progress_percent: 20,
    current_step: "rendering",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  generateHeatMap.mockResolvedValue(null);
  mockedPolling.mockReturnValue(null);
  mockedGenerate.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    generateHeatMap,
  });
});

describe("useHeatMapGeneration", () => {
  it("is idle before generation is requested", () => {
    const { result } = renderHook(() => useHeatMapGeneration("job-1"));
    expect(result.current.isPolling).toBe(false);
    expect(result.current.heatmapSource).toBeNull();
    expect(result.current.displayedError).toBeNull();
  });

  it("posts the request and starts polling on generate()", async () => {
    const { result } = renderHook(() => useHeatMapGeneration("job-1"));

    await act(async () => {
      await result.current.generate(request);
    });

    expect(generateHeatMap).toHaveBeenCalledWith(request);
    expect(result.current.isPolling).toBe(true);
  });

  it("exposes the finished image and stops polling at a terminal state", async () => {
    const { result, rerender } = renderHook(() => useHeatMapGeneration("job-1"));

    await act(async () => {
      await result.current.generate(request);
    });

    // The pipeline finished the heatmap and parked at results/waiting.
    mockedPolling.mockReturnValue(
      status({ phase: JobPhase.RESULTS, status: JobStatusValue.WAITING }),
    );
    rerender();

    expect(result.current.isPolling).toBe(false);
    expect(result.current.heatmapSource?.pngUrl).toContain("/api/v1/heatmap/job-1");
    expect(result.current.heatmapSource?.pdfUrl).toBe("/api/v1/heatmap/job-1?format=pdf");
  });

  it("consolidates a failed poll into a dismissable error banner", async () => {
    const { result, rerender } = renderHook(() => useHeatMapGeneration("job-1"));
    await act(async () => {
      await result.current.generate(request);
    });

    const problem = { title: "Failed", status: 500, detail: "R crashed", instance: "/x" };
    mockedPolling.mockReturnValue(status({ status: JobStatusValue.FAILED, error: problem }));
    rerender();

    expect(result.current.displayedError).toEqual(problem);
    expect(result.current.showError).toBe(true);
    expect(result.current.isPolling).toBe(false);

    act(() => result.current.dismissError());
    expect(result.current.showError).toBe(false);
  });

  it("surfaces a generation (POST) error", () => {
    mockedGenerate.mockReturnValue({
      data: null,
      isLoading: false,
      error: "Invalid grouping column",
      generateHeatMap,
    });

    const { result } = renderHook(() => useHeatMapGeneration("job-1"));

    expect(result.current.displayedError).toBe("Invalid grouping column");
    expect(result.current.showError).toBe(true);
  });
});
