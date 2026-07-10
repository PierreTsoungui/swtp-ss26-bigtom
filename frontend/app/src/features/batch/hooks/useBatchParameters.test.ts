import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchParametersResponse } from "../types";
import { useBatchParameters } from "./useBatchParameters";

const response: BatchParametersResponse = {
  job_id: "job-1",
  columns: [{ name: "Sample_Group", levels: 2, values: ["A", "B"] }],
  available_columns: ["Sample_Group"],
};

/** Builds a minimal `fetch` Response stub. */
function jsonResponse(body: unknown, ok = true, statusCode = 200): Response {
  return {
    ok,
    status: statusCode,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useBatchParameters", () => {
  it("does not fetch and reports not-loading when the job id is null", async () => {
    const { result } = renderHook(() => useBatchParameters(null));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.parameters).toBeNull();
  });

  it("loads parameters for a job id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(response));

    const { result } = renderHook(() => useBatchParameters("job-1"));

    await waitFor(() => expect(result.current.parameters).toEqual(response));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/v1/batch/job-1/batch-options");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("exposes a readable error when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, false, 500));

    const { result } = renderHook(() => useBatchParameters("job-1"));

    await waitFor(() => expect(result.current.error).toContain("HTTP 500"));
    expect(result.current.parameters).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("surfaces network exceptions as an unknown error", async () => {
    vi.mocked(fetch).mockRejectedValueOnce("boom");

    const { result } = renderHook(() => useBatchParameters("job-1"));

    await waitFor(() => expect(result.current.error).toBe("An unknown error occurred"));
  });
});
