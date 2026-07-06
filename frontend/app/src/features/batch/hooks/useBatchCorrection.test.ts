import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchHistoryResponse } from "../types";
import { useBatchCorrection } from "./useBatchCorrection";

const history: BatchHistoryResponse = {
  job_id: "job-1",
  rounds: [],
  current_round: 0,
  correction_applied: false,
};

/** Builds a minimal `fetch` Response stub. */
function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 400, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useBatchCorrection", () => {
  it("loads the history on mount", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(history));

    const { result } = renderHook(() => useBatchCorrection("job-1"));

    await waitFor(() => expect(result.current.history).toEqual(history));
    expect(fetch).toHaveBeenCalledWith("/api/v1/batch/job-1/history");
    expect(result.current.loading).toBe(false);
  });

  it("does nothing without a job id", async () => {
    const { result } = renderHook(() => useBatchCorrection(undefined));

    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a structured error when the history request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: "NOT_FOUND", message: "no job" }, false),
    );

    const { result } = renderHook(() => useBatchCorrection("job-1"));

    await waitFor(() =>
      expect(result.current.error).toEqual({ error: "NOT_FOUND", message: "no job" }),
    );
  });

  it("posts a correction request via runBatch", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(history)) // mount history
      .mockResolvedValueOnce(jsonResponse({})); // runBatch POST

    const { result } = renderHook(() => useBatchCorrection("job-1"));
    await waitFor(() => expect(result.current.history).toEqual(history));

    await act(async () => {
      await result.current.runBatch({
        batch_correction: { batch_variable: "Batch", covariates: ["Group"] },
      });
    });

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/batch/job-1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          batch_correction: { batch_variable: "Batch", covariates: ["Group"] },
        }),
      }),
    );
    expect(result.current.error).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  it("maps a runBatch server failure to a BATCH_FAILED-shaped error", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(history))
      .mockResolvedValueOnce(
        jsonResponse({ error: "BATCH_FAILED", message: "bad variable" }, false),
      );

    const { result } = renderHook(() => useBatchCorrection("job-1"));
    await waitFor(() => expect(result.current.history).toEqual(history));

    await act(async () => {
      await result.current.runBatch({
        batch_correction: { batch_variable: "Batch", covariates: [] },
      });
    });

    expect(result.current.error).toEqual({ error: "BATCH_FAILED", message: "bad variable" });
  });

  it("maps a runBatch network exception to NETWORK_ERROR", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(history))
      .mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHook(() => useBatchCorrection("job-1"));
    await waitFor(() => expect(result.current.history).toEqual(history));

    await act(async () => {
      await result.current.runBatch({
        batch_correction: { batch_variable: "Batch", covariates: [] },
      });
    });

    expect(result.current.error).toEqual({
      error: "NETWORK_ERROR",
      message: "Connection to server failed.",
    });
  });

  it("sends the group selection when skipping", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(history))
      .mockResolvedValueOnce(jsonResponse({}));

    const { result } = renderHook(() => useBatchCorrection("job-1"));
    await waitFor(() => expect(result.current.history).toEqual(history));

    const selection = { group_column: "Group", case_group: "T", control_group: "C" };
    await act(async () => {
      await result.current.skipBatch(selection);
    });

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/batch/job-1/skip",
      expect.objectContaining({ method: "POST", body: JSON.stringify(selection) }),
    );
    expect(result.current.error).toBeNull();
  });

  it("omits the body when skipping without a selection", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(history))
      .mockResolvedValueOnce(jsonResponse({}));

    const { result } = renderHook(() => useBatchCorrection("job-1"));
    await waitFor(() => expect(result.current.history).toEqual(history));

    await act(async () => {
      await result.current.skipBatch();
    });

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/v1/batch/job-1/skip",
      expect.objectContaining({ body: undefined }),
    );
  });

  it("maps a skip failure to a SKIP_FAILED-shaped error", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(history))
      .mockResolvedValueOnce(jsonResponse("not-structured", false));

    const { result } = renderHook(() => useBatchCorrection("job-1"));
    await waitFor(() => expect(result.current.history).toEqual(history));

    await act(async () => {
      await result.current.skipBatch();
    });

    expect(result.current.error).toEqual({
      error: "SKIP_FAILED",
      message: "Skipping batch correction failed.",
    });
  });
});
