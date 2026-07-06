import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFilterStats } from "./useFilterStats";
import type { FilteringStatsType } from "../types";

/** Minimal fetch Response stub for the fields the hook reads. */
function response(init: {
  ok: boolean;
  status?: number;
  statusText?: string;
  body?: unknown;
}): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    statusText: init.statusText ?? "",
    json: () => Promise.resolve(init.body),
  } as unknown as Response;
}

const sampleStats = { total_start: 1000, total_end: 900 } as unknown as FilteringStatsType;

describe("useFilterStats", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fetch and stays idle when jobId is null", () => {
    const { result } = renderHook(() => useFilterStats(null));

    expect(fetch).not.toHaveBeenCalled();
    expect(result.current).toEqual({ filterStats: null, isLoading: false, error: null });
  });

  it("returns the statistics on a successful response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ok: true, body: sampleStats }));

    const { result } = renderHook(() => useFilterStats("job-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/v1/filter/job-1/stats");
    expect(result.current.filterStats).toEqual(sampleStats);
    expect(result.current.error).toBeNull();
  });

  it("treats a 409 as 'not ready yet' without surfacing an error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response({ ok: false, status: 409 }));

    const { result } = renderHook(() => useFilterStats("job-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.filterStats).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("exposes an error message for a non-ok, non-409 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ ok: false, status: 500, statusText: "Internal Server Error" }),
    );

    const { result } = renderHook(() => useFilterStats("job-1"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain("500");
    expect(result.current.filterStats).toBeNull();
  });

  it("exposes an error message when the request rejects (network error)", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Network down"));

    const { result } = renderHook(() => useFilterStats("job-1"));

    await waitFor(() => expect(result.current.error).toBe("Network down"));
    expect(result.current.filterStats).toBeNull();
  });
});
