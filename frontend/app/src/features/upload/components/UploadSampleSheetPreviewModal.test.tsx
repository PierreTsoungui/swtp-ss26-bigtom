import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import UploadSampleSheetPreviewModal from "./UploadSampleSheetPreviewModal";
import { previewSheet } from "../hooks/uploadApi";
import type { SheetPreview } from "../types";

vi.mock("../hooks/uploadApi", () => ({ previewSheet: vi.fn() }));

const mockedPreview = vi.mocked(previewSheet);

const preview: SheetPreview = {
  sheet_id: "sheet-1",
  columns: ["Sample_Name", "Sample_Group"],
  rows: [
    ["S1", "Control"],
    ["S2", "Cancer"],
  ],
  total_rows: 2,
  truncated: false,
};

function renderModal(onClose = vi.fn()) {
  render(
    <UploadSampleSheetPreviewModal
      sessionId="sess-1"
      sheetId="sheet-1"
      sheetName="SampleSheet.csv"
      onClose={onClose}
    />,
  );
  return onClose;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UploadSampleSheetPreviewModal", () => {
  it("shows a loading state before the preview resolves", () => {
    mockedPreview.mockReturnValue(new Promise(() => {})); // never resolves
    renderModal();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(mockedPreview).toHaveBeenCalledWith("sess-1", "sheet-1");
  });

  it("renders the sheet name and table once loaded", async () => {
    mockedPreview.mockResolvedValue(preview);
    renderModal();

    await waitFor(() => expect(screen.getByText("Preview · SampleSheet.csv")).toBeInTheDocument());
    expect(screen.getByText("Sample_Name")).toBeInTheDocument();
    expect(screen.getByText("Cancer")).toBeInTheDocument();
    expect(screen.getByText("2 samples")).toBeInTheDocument();
  });

  it("notes when the preview is truncated", async () => {
    mockedPreview.mockResolvedValue({ ...preview, total_rows: 500, truncated: true });
    renderModal();
    await waitFor(() =>
      expect(screen.getByText(/500 samples \(showing first 2\)/)).toBeInTheDocument(),
    );
  });

  it("renders an error message when the preview fails", async () => {
    mockedPreview.mockRejectedValue(new Error("Preview failed"));
    renderModal();
    await waitFor(() => expect(screen.getByText("Preview failed")).toBeInTheDocument());
  });

  it("closes via the close button and the backdrop, but not the panel body", async () => {
    mockedPreview.mockResolvedValue(preview);
    const onClose = renderModal();

    await waitFor(() => expect(screen.getByText("Sample_Name")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("heading", { name: /Preview ·/ }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
