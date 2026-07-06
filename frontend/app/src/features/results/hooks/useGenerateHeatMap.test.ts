import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGenerateHeatMap } from "./useGenerateHeatMap";
import type { HeatMapRequest, HeatMapResponse } from "../types";

const request: HeatMapRequest = {
  filters: { gene: "TP53" },
  grouping: { primary: "Sample_Group" },
};

const response: HeatMapResponse = {
  job_id: "job-1",
  phase: "heatmap",
  status: "completed",
  heatmap_metadata: { detected_cpgs: 12, plotted_samples: 48, message: "ok" },
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useGenerateHeatMap", () => {
  it("returns null and sets an error when the job id is missing", async () => {
    const { result } = renderHook(() => useGenerateHeatMap(null));

    let value: HeatMapResponse | null = response;
    await act(async () => {
      value = await result.current.generateHeatMap(request);
    });

    expect(value).toBeNull();
    expect(result.current.error).toBe("Missing job id");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the request and returns the response on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(response),
    } as Response);

    const { result } = renderHook(() => useGenerateHeatMap("job-1"));

    let value: HeatMapResponse | null = null;
    await act(async () => {
      value = await result.current.generateHeatMap(request);
    });

    expect(value).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/heatmap/job-1",
      expect.objectContaining({ method: "POST", body: JSON.stringify(request) }),
    );
    expect(result.current.error).toBeNull();
  });

  it("surfaces the API error message on a failed response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ detail: "Invalid grouping column" })),
    } as unknown as Response);

    const { result } = renderHook(() => useGenerateHeatMap("job-1"));

    let value: HeatMapResponse | null = response;
    await act(async () => {
      value = await result.current.generateHeatMap(request);
    });

    expect(value).toBeNull();
    expect(result.current.error).toBe("Invalid grouping column");
  });
});
