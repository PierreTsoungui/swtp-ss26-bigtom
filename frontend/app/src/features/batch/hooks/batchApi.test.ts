import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { previewSampleSheet } from "./batchApi";
import type { SampleSheetPreview } from "../types";

function jsonResponse(body: unknown, ok = true, statusCode = 200): Response {
  return { ok, status: statusCode, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("previewSampleSheet", () => {
  it("requests the job's sample sheet and returns the preview", async () => {
    const preview = {
      job_id: "job-1",
      columns: ["Sample_Name"],
      rows: [["S1"]],
      total_rows: 1,
      truncated: false,
    } as SampleSheetPreview;
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(preview));

    const result = await previewSampleSheet("job-1");

    expect(result).toEqual(preview);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/v1/batch/job-1/sample-sheet");
  });

  it("forwards the abort signal to fetch", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}));
    const controller = new AbortController();

    await previewSampleSheet("job-1", controller.signal);

    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it("throws a descriptive error on a non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, false, 404));

    await expect(previewSampleSheet("job-1")).rejects.toThrow("Error 404");
  });
});
