import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { BatchRound } from "../types";
import { SvdPlot } from "./SvdPlot";

// Decouple from the shared plot renderer: capture the sources it receives so we
// can assert the SvdPlot builds the correct PNG/PDF descriptors per round.
const plotViewSpy = vi.fn();
vi.mock("../../../shared/plots", () => ({
  PlotView: (props: { source: unknown }) => {
    plotViewSpy(props.source);
    return <div data-testid="plot-view" />;
  },
}));

const initialRound: BatchRound = {
  round: 0,
  timestamp: "2024-01-01T00:00:00Z",
  type: "initial",
  svd_plot: "/api/v1/batch/job-1/svd-plot/0",
  settings_used: null,
};

const correctionRound: BatchRound = {
  round: 1,
  timestamp: "2024-01-01T01:00:00Z",
  type: "correction",
  svd_plot: "/api/v1/batch/job-1/svd-plot/1",
  settings_used: { batch_variable: "Sentrix_ID", covariates: ["Sample_Group"] },
};

describe("SvdPlot", () => {
  it("renders a fallback message when there are no rounds", () => {
    render(<SvdPlot rounds={[]} />);
    expect(screen.getByText("No SVD diagnostics available.")).toBeInTheDocument();
    expect(screen.queryByTestId("plot-view")).not.toBeInTheDocument();
  });

  it("renders a titled card and plot for each round", () => {
    render(<SvdPlot rounds={[initialRound, correctionRound]} />);

    expect(screen.getByRole("heading", { name: "SVD diagnostic plots" })).toBeInTheDocument();
    expect(screen.getByText("Before correction (Round 0)")).toBeInTheDocument();
    expect(screen.getByText("After correction (Round 1)")).toBeInTheDocument();
    expect(screen.getAllByTestId("plot-view")).toHaveLength(2);
  });

  it("shows the applied settings summary only for rounds that have them", () => {
    render(<SvdPlot rounds={[initialRound, correctionRound]} />);

    // The correction round summarizes removed/protected variables.
    expect(screen.getByText("Sentrix_ID")).toBeInTheDocument();
    expect(screen.getByText(/Sample_Group/)).toBeInTheDocument();
  });

  it("summarizes 'none' when a correction round protects no covariates", () => {
    render(
      <SvdPlot
        rounds={[
          {
            ...correctionRound,
            settings_used: { batch_variable: "Sentrix_ID", covariates: [] },
          },
        ]}
      />,
    );

    expect(screen.getByText(/none/)).toBeInTheDocument();
  });

  it("builds png and pdf sources from each round's plot url", () => {
    plotViewSpy.mockClear();
    render(<SvdPlot rounds={[correctionRound]} />);

    expect(plotViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        pngUrl: "/api/v1/batch/job-1/svd-plot/1?format=png",
        pdfUrl: "/api/v1/batch/job-1/svd-plot/1?format=pdf",
        downloadName: "svd_plot_round_1",
      }),
    );
  });
});
