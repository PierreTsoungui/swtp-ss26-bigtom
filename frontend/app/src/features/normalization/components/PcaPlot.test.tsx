import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PcaPlot from "./PcaPlot";
import type { PcaData } from "../types";

const data: PcaData = {
  variance_explained: { pc1: 40, pc2: 25 },
  points: [
    { sample: "s1", group: "A", pc1: -1, pc2: -1 },
    { sample: "s2", group: "A", pc1: 0.5, pc2: 0.2 },
    { sample: "s3", group: "B", pc1: 1, pc2: 1 },
  ],
};

const groupColors = { A: "#1f77b4", B: "#d62728" };

describe("PcaPlot", () => {
  it("renders an error placeholder when the PCA failed", () => {
    render(
      <PcaPlot
        data={{ points: [], error: "singular matrix" }}
        groupColors={{}}
        sampleColors={{}}
      />,
    );
    expect(screen.getByText(/PCA not available: singular matrix/)).toBeInTheDocument();
  });

  it("renders an empty placeholder when there are no points", () => {
    render(<PcaPlot data={{ points: [] }} groupColors={{}} sampleColors={{}} />);
    expect(screen.getByText("No PCA data")).toBeInTheDocument();
  });

  it("renders one circle per point with a hover title", () => {
    const { container } = render(
      <PcaPlot data={data} groupColors={groupColors} sampleColors={{}} />,
    );
    expect(container.querySelectorAll("circle")).toHaveLength(3);
    expect(screen.getByText("s1 (A)")).toBeInTheDocument();
  });

  it("shows axis titles with variance explained", () => {
    render(<PcaPlot data={data} groupColors={groupColors} sampleColors={{}} />);
    expect(screen.getByText("PC1 (40%)")).toBeInTheDocument();
    expect(screen.getByText("PC2 (25%)")).toBeInTheDocument();
  });

  it("renders a legend entry per group plus per sample override", () => {
    render(<PcaPlot data={data} groupColors={groupColors} sampleColors={{ s2: "#000000" }} />);
    expect(screen.getByText("Legend")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    // The overridden sample appears in the legend as its own entry.
    expect(screen.getByText("s2")).toBeInTheDocument();
  });

  it("hides the legend when showLegend is false", () => {
    render(<PcaPlot data={data} groupColors={groupColors} sampleColors={{}} showLegend={false} />);
    expect(screen.queryByText("Legend")).not.toBeInTheDocument();
  });

  it("draws labels only for the requested samples", () => {
    render(
      <PcaPlot data={data} groupColors={groupColors} sampleColors={{}} labeledSamples={["s3"]} />,
    );
    // s3 is labeled directly on the plot; s1 is not (it only appears in a <title>).
    expect(screen.getByText("s3")).toBeInTheDocument();
  });
});
