import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useHeatMapOptions } from "./useHeatMapOptions";
import type { HeatMapOptionsResponse } from "../types";

const options: HeatMapOptionsResponse = {
  job_id: "job-1",
  available_columns: [{ name: "Sample_Group", type: "categorical", n_distinct: 2 }],
};

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useHeatMapOptions", () => {
  it("does not fetch when the job id is null", () => {
    const { result } = renderHook(() => useHeatMapOptions(null));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it("loads the annotation options for a job", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(options));

    const { result } = renderHook(() => useHeatMapOptions("job-1"));

    await waitFor(() => expect(result.current.data).toEqual(options));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/v1/heatmap/job-1/options");
    expect(result.current.isLoading).toBe(false);
  });

  it("exposes a readable error on failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, false));

    const { result } = renderHook(() => useHeatMapOptions("job-1"));

    await waitFor(() => expect(result.current.error).toBe("Failed to fetch heatmap options"));
  });
});
