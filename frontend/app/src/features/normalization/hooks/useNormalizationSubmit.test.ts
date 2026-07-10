import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNormalizationSubmit } from "./useNormalizationSubmit";

/** Builds a minimal `fetch` Response stub. */
function jsonResponse(body: unknown, ok = true, statusCode = 200): Response {
  return { ok, status: statusCode, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useNormalizationSubmit", () => {
  it("returns false and does not fetch without a job id", async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useNormalizationSubmit(null, onError));

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.submitMethod("noob");
    });

    expect(accepted).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the chosen method and returns true on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    const onError = vi.fn();
    const { result } = renderHook(() => useNormalizationSubmit("job-1", onError));

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.submitMethod("quantile");
    });

    expect(accepted).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/normalize/job-1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ method: "quantile" }),
      }),
    );
    expect(onError).toHaveBeenCalledWith(null); // cleared at the start
    expect(result.current.isSubmitting).toBe(false);
  });

  it("reports the server problem detail on a non-ok response", async () => {
    const problem = { title: "Bad", status: 400, detail: "invalid method", instance: "" };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(problem, false, 400));
    const onError = vi.fn();
    const { result } = renderHook(() => useNormalizationSubmit("job-1", onError));

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.submitMethod("swan");
    });

    expect(accepted).toBe(false);
    expect(onError).toHaveBeenLastCalledWith(problem);
  });

  it("synthesizes a problem detail when the error body is unparseable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error("no body")),
    } as unknown as Response);
    const onError = vi.fn();
    const { result } = renderHook(() => useNormalizationSubmit("job-1", onError));

    await act(async () => {
      await result.current.submitMethod("noob");
    });

    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "Request failed", status: 503, detail: "HTTP 503" }),
    );
  });

  it("reports a readable message on a network exception", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    const onError = vi.fn();
    const { result } = renderHook(() => useNormalizationSubmit("job-1", onError));

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.submitMethod("noob");
    });

    expect(accepted).toBe(false);
    expect(onError).toHaveBeenLastCalledWith("offline");
  });
});
