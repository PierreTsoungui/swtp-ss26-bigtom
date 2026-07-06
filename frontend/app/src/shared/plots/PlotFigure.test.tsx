import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PlotFigure from "./PlotFigure";
import type { PlotSource } from "./types";

const source: PlotSource = {
  pngUrl: "/api/v1/plot.png",
  pdfUrl: "/api/v1/plot.pdf",
  title: "Density plot",
  downloadName: "density",
};

describe("PlotFigure", () => {
  it("renders the PNG with the title as its alt text", () => {
    render(<PlotFigure source={source} onEnlarge={vi.fn()} />);
    const img = screen.getByAltText("Density plot");
    expect(img).toHaveAttribute("src", "/api/v1/plot.png");
  });

  it("enlarges via the accessible button", () => {
    const onEnlarge = vi.fn();
    render(<PlotFigure source={source} onEnlarge={onEnlarge} />);
    fireEvent.click(screen.getByRole("button", { name: "Enlarge Density plot" }));
    expect(onEnlarge).toHaveBeenCalledTimes(1);
  });
});
