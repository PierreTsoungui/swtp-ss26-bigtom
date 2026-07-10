import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNormalizationPreview } from "./useNormalizationPreview";
import type { NormalizationPreview } from "../types";

const preview: NormalizationPreview = {
  job_id: "job-1",
  methods: [{ method: "raw", density_url: "/raw.png", pca: null }],
};

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

describe("useNormalizationPreview", () => {
  it("does not fetch when the job id is null", () => {
    const { result } = renderHook(() => useNormalizationPreview(null));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("loads previews for a job id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(preview));

    const { result } = renderHook(() => useNormalizationPreview("job-1"));

    await waitFor(() => expect(result.current.data).toEqual(preview));
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/v1/preview/normalization/job-1");
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("surfaces a server problem detail on a non-ok response", async () => {
    const problem = { title: "Boom", status: 500, detail: "server error", instance: "" };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(problem, false, 500));

    const { result } = renderHook(() => useNormalizationPreview("job-1"));

    await waitFor(() => expect(result.current.error).toEqual(problem));
    expect(result.current.data).toBeNull();
  });

  it("falls back to a rate-limit problem when the error body is unparseable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.reject(new Error("no body")),
    } as unknown as Response);

    const { result } = renderHook(() => useNormalizationPreview("job-1"));

    await waitFor(() =>
      expect(result.current.error).toMatchObject({ title: "Too Many Requests", status: 429 }),
    );
  });

  it("lets the caller clear the error via setError", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ title: "x", status: 500, detail: "d", instance: "" }, false, 500),
    );

    const { result } = renderHook(() => useNormalizationPreview("job-1"));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    result.current.setError(null);
    await waitFor(() => expect(result.current.error).toBeNull());
  });
});
