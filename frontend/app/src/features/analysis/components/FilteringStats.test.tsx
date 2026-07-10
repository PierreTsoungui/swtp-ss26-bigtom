import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilteringStats } from "./FilteringStats";
import type { FilteringStatsType } from "../types";

function buildFilteringStats(overrides: Partial<FilteringStatsType> = {}): FilteringStatsType {
  return {
    total_start: 500000,
    total_removed: 15000,
    total_end: 485000,
    det_p: { enabled: true, cutoff: 0.01, removed: 12000, after: 488000 },
    bead_count: { enabled: false, bead_cutoff: 0.05, removed: 0, after: 488000 },
    non_cpg: { enabled: false, removed: 0, after: 488000 },
    snp: { enabled: true, maf_cutoff: 0.05, removed: 3000, after: 485000 },
    multi_hit: { enabled: false, removed: 0, after: 485000 },
    xy_chromosomes: { enabled: false, removed: 0, after: 485000 },
    sample_quality: {
      enabled: true,
      detection_p_cutoff: 0.01,
      sample_failure_rate: 0.1,
      enable_pca_outlier_detection: false,
      remove_failed_samples: true,
      samples_before: 12,
      samples_removed: 1,
      samples_after: 11,
    },
    ...overrides,
  };
}

const complementaryStats = buildFilteringStats({
  det_p: { enabled: false, cutoff: 0.01, removed: 0, after: 500000 },
  bead_count: { enabled: true, bead_cutoff: 0.05, removed: 5000, after: 495000 },
  non_cpg: { enabled: true, removed: 2000, after: 493000 },
  snp: { enabled: false, maf_cutoff: 0.05, removed: 0, after: 493000 },
  multi_hit: { enabled: true, removed: 3000, after: 490000 },
  xy_chromosomes: { enabled: true, removed: 5000, after: 485000 },
  sample_quality: {
    enabled: true,
    detection_p_cutoff: 0.01,
    sample_failure_rate: 0.05,
    enable_pca_outlier_detection: true,
    remove_failed_samples: true,
    samples_before: 10,
    samples_removed: 0,
    samples_after: 10,
  },
});

describe("FilteringStats Component", () => {
  it("renders active filter stats card grids and tables correctly in internationalized English", () => {
    // Arrange & Act
    render(<FilteringStats stats={buildFilteringStats()} />);

    // Assert main header titles via accessible headings
    expect(screen.getByRole("heading", { name: "Filtering Statistics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Probe Filters" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sample Quality Filter" })).toBeInTheDocument();

    // Assert table headers and column strings directly
    expect(screen.getByText("Filter")).toBeInTheDocument();
    expect(screen.getByText("Probes Before")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
    expect(screen.getByText("Remaining")).toBeInTheDocument();

    // Assert row identifiers safely via getByText
    expect(screen.getByText(/Detection P-Value/i)).toBeInTheDocument();
    expect(screen.getByText("SNP")).toBeInTheDocument();
    expect(screen.queryByText("Bead Count")).not.toBeInTheDocument();

    // Verify US standard numerical representations (commas instead of points)
    expect(screen.getAllByText("500,000").length).toBeGreaterThan(0);
    expect(screen.getByText("15,000")).toBeInTheDocument();
    expect(screen.getAllByText("485,000").length).toBeGreaterThan(0);

    expect(screen.getByText("○ Inactive")).toBeInTheDocument();
  });

  it("safely expands and maps all alternative filtering options in the matrix layout", () => {
    // Arrange & Act
    render(<FilteringStats stats={complementaryStats} />);

    // Assert rows targeted by the alternative filter steps payload via text
    expect(screen.getByText(/Bead Count/i)).toBeInTheDocument();
    expect(screen.getByText("Non-CpG")).toBeInTheDocument();
    expect(screen.getByText("Multi-Hit")).toBeInTheDocument();
    expect(screen.getByText("XY Chromosomes")).toBeInTheDocument();
    expect(screen.queryByText("SNP")).not.toBeInTheDocument();

    expect(screen.getByText("✓ Active")).toBeInTheDocument();
  });

  it("renders a 0.0% removal rate without dividing by zero when no probes were present", () => {
    render(
      <FilteringStats
        stats={buildFilteringStats({ total_start: 0, total_removed: 0, total_end: 0 })}
      />,
    );

    // The percentage guard avoids NaN when the starting probe count is zero.
    expect(screen.getByText("(0.0%)")).toBeInTheDocument();
  });

  it("gracefully catches and renders empty or invalid statistics data", () => {
    // Arrange & Act
    render(<FilteringStats stats={null} />);

    // Assert feedback boxes
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Filtering Statistics Not Available" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The received statistical data is empty or invalid."),
    ).toBeInTheDocument();
  });
});
