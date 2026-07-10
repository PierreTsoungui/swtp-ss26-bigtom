import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlotExportButtons from "./PlotExportButtons";
import { downloadPlot } from "./downloadPlot";
import type { PlotSource } from "./types";

vi.mock("./downloadPlot", () => ({ downloadPlot: vi.fn() }));

const mockedDownload = vi.mocked(downloadPlot);

const source: PlotSource = {
  pngUrl: "/api/v1/plot.png",
  pdfUrl: "/api/v1/plot.pdf",
  title: "PCA plot",
  downloadName: "pca",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedDownload.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlotExportButtons", () => {
  it("downloads the PNG and PDF from their respective URLs", async () => {
    render(<PlotExportButtons source={source} />);

    fireEvent.click(screen.getByRole("button", { name: "Export PCA plot as PNG" }));
    await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith("/api/v1/plot.png", "pca.png"));

    fireEvent.click(screen.getByRole("button", { name: "Export PCA plot as PDF" }));
    await waitFor(() => expect(mockedDownload).toHaveBeenCalledWith("/api/v1/plot.pdf", "pca.pdf"));
  });

  it("reports a failed export through onError", async () => {
    mockedDownload.mockRejectedValueOnce(new Error("network"));
    const onError = vi.fn();
    render(<PlotExportButtons source={source} onError={onError} />);

    fireEvent.click(screen.getByRole("button", { name: "Export PCA plot as PNG" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
  });

  it("logs to the console when no onError handler is supplied", async () => {
    mockedDownload.mockRejectedValueOnce(new Error("network"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<PlotExportButtons source={source} />);

    fireEvent.click(screen.getByRole("button", { name: "Export PCA plot as PDF" }));
    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
  });

  it("disables both buttons while an export is in flight", async () => {
    let resolveDownload: () => void = () => {};
    mockedDownload.mockReturnValueOnce(new Promise<void>((resolve) => (resolveDownload = resolve)));
    render(<PlotExportButtons source={source} />);

    const pngButton = screen.getByRole("button", { name: "Export PCA plot as PNG" });
    fireEvent.click(pngButton);

    await waitFor(() => expect(pngButton).toBeDisabled());
    expect(screen.getByRole("button", { name: "Export PCA plot as PDF" })).toBeDisabled();

    resolveDownload();
    await waitFor(() => expect(pngButton).toBeEnabled());
  });
});
