import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  commitUpload,
  discardUpload,
  inspectUpload,
  previewSheet,
  problemMessage,
} from "./uploadApi";
import type { CommitSelection, InspectManifest, SheetPreview } from "../types";

function jsonResponse(body: unknown, ok = true, statusCode = 200): Response {
  return { ok, status: statusCode, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("problemMessage", () => {
  it("reads a flat problem detail string", () => {
    expect(problemMessage({ detail: "Bad file" }, "fallback")).toBe("Bad file");
  });

  it("reads a nested detail.detail / detail.message", () => {
    expect(problemMessage({ detail: { detail: "nested" } }, "fallback")).toBe("nested");
    expect(problemMessage({ detail: { message: "msg" } }, "fallback")).toBe("msg");
  });

  it("falls back for non-object or unrecognized bodies", () => {
    expect(problemMessage(null, "fallback")).toBe("fallback");
    expect(problemMessage("nope", "fallback")).toBe("fallback");
    expect(problemMessage({ other: 1 }, "fallback")).toBe("fallback");
  });
});

describe("inspectUpload", () => {
  it("posts the files as multipart form data and returns the manifest", async () => {
    const manifest = { session_id: "s1" } as InspectManifest;
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(manifest));

    const file = new File(["x"], "a.idat");
    const result = await inspectUpload([file]);

    expect(result).toEqual(manifest);
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/v1/upload/inspect");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it("throws the problem detail on a failed inspection", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: "Unreadable ZIP" }, false, 400));

    await expect(inspectUpload([new File(["x"], "a.idat")])).rejects.toThrow("Unreadable ZIP");
  });

  it("uses the fallback message when the error body is not JSON", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("no body")),
    } as unknown as Response);

    await expect(inspectUpload([new File(["x"], "a.idat")])).rejects.toThrow("Inspection failed");
  });
});

describe("previewSheet", () => {
  it("requests the preview with encoded query params", async () => {
    const preview = {
      sheet_id: "sheet 1",
      columns: [],
      rows: [],
      total_rows: 0,
      truncated: false,
    } as SheetPreview;
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(preview));

    const result = await previewSheet("sess1", "sheet 1", 10);

    expect(result).toEqual(preview);
    const url = vi.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toBe("/api/v1/upload/sess1/preview?sheet_id=sheet%201&rows=10");
  });
});

describe("commitUpload", () => {
  const selection = {
    session_id: "sess1",
    selected_sample_sheet_id: "sheet1",
    selected_pair_ids: ["p1"],
    column_mapping: {
      sentrix_id: "Sentrix_ID",
      sentrix_position: "Sentrix_Position",
      sample_group: "Group",
      sample_name: "Name",
    },
    filter_settings: {},
  } as unknown as CommitSelection;

  it("posts the selection and returns the job id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ job_id: "job-42" }));

    const jobId = await commitUpload(selection);

    expect(jobId).toBe("job-42");
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("/api/v1/upload/commit");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).body).toBe(JSON.stringify(selection));
  });

  it("throws the problem detail on failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ detail: "Invalid mapping" }, false, 422));

    await expect(commitUpload(selection)).rejects.toThrow("Invalid mapping");
  });
});

describe("discardUpload", () => {
  it("fires a best-effort DELETE and swallows network errors", () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));

    expect(() => discardUpload("sess1")).not.toThrow();
    expect(fetch).toHaveBeenCalledWith("/api/v1/upload/sess1", { method: "DELETE" });
  });
});
