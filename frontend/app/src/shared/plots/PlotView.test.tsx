import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PlotView from "./PlotView";
import { downloadPlot } from "./downloadPlot";
import type { PlotSource } from "./types";

vi.mock("./downloadPlot", () => ({
  downloadPlot: vi.fn().mockResolvedValue(undefined),
}));

const source: PlotSource = {
  pngUrl: "/api/v1/plot.png",
  pdfUrl: "/api/v1/plot.pdf",
  title: "Test plot",
  downloadName: "test_plot",
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("PlotView", () => {
  it("renders the inline figure with the PNG and an accessible enlarge control", () => {
    render(<PlotView source={source} />);

    const img = screen.getByAltText("Test plot");
    expect(img).toHaveAttribute("src", "/api/v1/plot.png");
    expect(
      screen.getByRole("button", { name: "Enlarge Test plot" }),
    ).toBeInTheDocument();
  });

  it("exports PNG and PDF from the correct URLs", async () => {
    render(<PlotView source={source} />);

    // Exports run one at a time (buttons disable while a download is pending),
    // so wait for the first to settle before triggering the second.
    fireEvent.click(screen.getByRole("button", { name: "Export Test plot as PNG" }));
    await waitFor(() =>
      expect(downloadPlot).toHaveBeenCalledWith("/api/v1/plot.png", "test_plot.png"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Export Test plot as PDF" }));
    await waitFor(() =>
      expect(downloadPlot).toHaveBeenCalledWith("/api/v1/plot.pdf", "test_plot.pdf"),
    );
  });

  it("opens the lightbox on click and closes it with Escape", () => {
    render(<PlotView source={source} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enlarge Test plot" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByAltText("Test plot")).toBeInTheDocument();
    // Export controls are available inside the lightbox as well.
    expect(
      within(dialog).getByRole("button", { name: "Export Test plot as PDF" }),
    ).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
