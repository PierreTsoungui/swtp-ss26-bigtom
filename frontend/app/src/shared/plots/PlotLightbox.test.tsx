import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlotLightbox from "./PlotLightbox";
import type { PlotSource } from "./types";

// The export controls delegate to downloadPlot; stub it so the lightbox test
// stays focused on dialog behaviour.
vi.mock("./downloadPlot", () => ({ downloadPlot: vi.fn().mockResolvedValue(undefined) }));

const source: PlotSource = {
  pngUrl: "/api/v1/plot.png",
  pdfUrl: "/api/v1/plot.pdf",
  title: "SVD plot",
  downloadName: "svd",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlotLightbox", () => {
  it("renders an accessible dialog with the enlarged figure and title", () => {
    render(<PlotLightbox source={source} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "SVD plot" })).toBeInTheDocument();
    expect(within(dialog).getByAltText("SVD plot")).toHaveAttribute("src", "/api/v1/plot.png");
  });

  it("focuses the close button on open and closes on click", () => {
    const onClose = vi.fn();
    render(<PlotLightbox source={source} onClose={onClose} />);

    const closeButton = screen.getByRole("button", { name: "Close" });
    expect(closeButton).toHaveFocus();

    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape and on a backdrop click, but not on a panel click", () => {
    const onClose = vi.fn();
    const { container } = render(<PlotLightbox source={source} onClose={onClose} />);

    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("restores body scroll when unmounted", () => {
    const { unmount } = render(<PlotLightbox source={source} onClose={vi.fn()} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
