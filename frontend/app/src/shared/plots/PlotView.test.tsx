import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi} from "vitest";

import PlotView from "./PlotView";
import { downloadPlot } from "./downloadPlot";
import type { PlotSource } from "./types";

vi.mock("./downloadPlot", () => ({
  downloadPlot: vi.fn().mockResolvedValue(undefined),
}));

// Mock localized downstream sub-elements to decouple layout testing and easily trigger error states
vi.mock("./PlotExportButtons", () => ({
  default: ({ source,  onError }: any) => ( //size,
    <div data-testid="plot-export-buttons">
      <button onClick={() => downloadPlot(source.pngUrl, `${source.downloadName}.png`)}>Export Test plot as PNG</button>
      <button onClick={() => downloadPlot(source.pdfUrl, `${source.downloadName}.pdf`)}>Export Test plot as PDF</button>
      <button onClick={() => onError?.(new Error("Export failed manually"))}>Simulate Export Error</button>
    </div>
  ),
}));

vi.mock("./PlotFigure", () => ({
  default: ({ source, onEnlarge }: any) => (
    <div data-testid="plot-figure">
      <img src={source.pngUrl} alt={source.title} />
      <button onClick={onEnlarge}>Enlarge Test plot</button>
    </div>
  ),
}));

vi.mock("./PlotLightbox", () => ({
  default: ({ source, onClose, onExportError }: any) => (
    <div role="dialog" data-testid="plot-lightbox">
      <img src={source.pngUrl} alt={source.title} />
      <button onClick={() => downloadPlot(source.pdfUrl, `${source.downloadName}.pdf`)}>Export Test plot as PDF</button>
      <button onClick={() => onExportError?.(new Error("Lightbox export failed"))}>Simulate Lightbox Error</button>
      <button onClick={onClose}>Close Lightbox</button>
    </div>
  ),
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

describe("PlotView Component Layer", () => {
  it("renders the inline figure with the PNG and an accessible enlarge control trigger", () => {
    // Arrange & Act
    render(<PlotView source={source} />);

    // Assert preview elements mount safely
    const img = screen.getByAltText("Test plot");
    expect(img).toHaveAttribute("src", "/api/v1/plot.png");
    expect(screen.getByRole("button", { name: "Enlarge Test plot" })).toBeInTheDocument();
  });

  it("exports PNG and PDF assets correctly from their dedicated server endpoint URLs", async () => {
    // Arrange & Act
    render(<PlotView source={source} />);

    // Act & Assert - Trigger PNG Download
    fireEvent.click(screen.getByRole("button", { name: "Export Test plot as PNG" }));
    await waitFor(() =>
      expect(downloadPlot).toHaveBeenCalledWith("/api/v1/plot.png", "test_plot.png")
    );

    // Act & Assert - Trigger PDF Download
    fireEvent.click(screen.getByRole("button", { name: "Export Test plot as PDF" }));
    await waitFor(() =>
      expect(downloadPlot).toHaveBeenCalledWith("/api/v1/plot.pdf", "test_plot.pdf")
    );
  });

    it("opens the lightbox on click and manages full backdrop dismissals using the close action control button", () => {
    // Arrange
    render(<PlotView source={source} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Act - Open Lightbox overlay modal container
    fireEvent.click(screen.getByRole("button", { name: "Enlarge Test plot" }));

    // Assert internal elements mount into dialog tree context
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByAltText("Test plot")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Export Test plot as PDF" })).toBeInTheDocument();

    // Act - Dismiss lightbox modal via the rendered Close button from our mock layout
    fireEvent.click(within(dialog).getByRole("button", { name: "Close Lightbox" }));
    
    // Assert modal container safely unmounts from active DOM document
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });


  it("correctly intercepts and bubbles download export error payloads back up to parent callback hooks", () => {
    // Arrange
    const onExportErrorMock = vi.fn();
    render(<PlotView source={source} onExportError={onExportErrorMock} />);

    // Act - Trigger error from export buttons component
    fireEvent.click(screen.getByRole("button", { name: "Simulate Export Error" }));

    // Assert error propagates into mock loop parameters
    expect(onExportErrorMock).toHaveBeenCalledTimes(1);
    expect(onExportErrorMock).toHaveBeenCalledWith(expect.any(Error));

    // Act - Trigger error from within active lightbox view layers
    fireEvent.click(screen.getByRole("button", { name: "Enlarge Test plot" }));
    fireEvent.click(screen.getByRole("button", { name: "Simulate Lightbox Error" }));

    expect(onExportErrorMock).toHaveBeenCalledTimes(2);
  });
});
