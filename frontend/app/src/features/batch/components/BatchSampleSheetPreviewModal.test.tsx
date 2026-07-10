import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SampleSheetPreview } from "../types";
import BatchSampleSheetPreviewModal from "./BatchSampleSheetPreviewModal";

const preview: SampleSheetPreview = {
  job_id: "job-1",
  columns: ["Sample_Name", "Sample_Group"],
  rows: [
    ["S1", "Control"],
    ["S2", "Cancer"],
  ],
  total_rows: 2,
  truncated: false,
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

describe("BatchSampleSheetPreviewModal", () => {
  it("shows a loading state before the preview resolves", () => {
    vi.mocked(fetch).mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(<BatchSampleSheetPreviewModal jobId="job-1" onClose={vi.fn()} />);

    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe("/api/v1/batch/job-1/sample-sheet");
  });

  it("renders the sample sheet table once loaded", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(preview));
    render(<BatchSampleSheetPreviewModal jobId="job-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Sample_Name")).toBeInTheDocument());
    expect(screen.getByText("Control")).toBeInTheDocument();
    expect(screen.getByText("Cancer")).toBeInTheDocument();
    expect(screen.getByText("2 samples")).toBeInTheDocument();
  });

  it("notes when the preview was truncated", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ ...preview, total_rows: 500, truncated: true }),
    );
    render(<BatchSampleSheetPreviewModal jobId="job-1" onClose={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByText(/500 samples \(showing first 2\)/)).toBeInTheDocument(),
    );
  });

  it("renders a readable error when the request fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(null, false, 404));
    render(<BatchSampleSheetPreviewModal jobId="job-1" onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Error 404")).toBeInTheDocument());
  });

  it("closes via the close button and the backdrop, but not the panel body", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(preview));
    const onClose = vi.fn();
    render(<BatchSampleSheetPreviewModal jobId="job-1" onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("Sample_Name")).toBeInTheDocument());

    // Clicking inside the panel must not close the modal.
    fireEvent.click(screen.getByRole("heading", { name: "Sample sheet" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
