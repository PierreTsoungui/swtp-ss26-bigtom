import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilteringStats } from "../components/FilteringStats";
import type { FilteringStatsType } from "../utils/types";

function buildFilteringStats(overrides: Partial<FilteringStatsType> = {}): FilteringStatsType {
  return {
    total_start: 500000,
    total_removed: 15000,
    total_end: 485000,
    det_p: {
      enabled: true,
      cutoff: 0.01,
      removed: 12000,
      after: 488000,
    },
    bead_count: {
      enabled: false,
      bead_cutoff: 0.05,
      removed: 0,
      after: 488000,
    },
    non_cpg: {
      enabled: false,
      removed: 0,
      after: 488000,
    },
    snp: {
      enabled: true,
      maf_cutoff: 0.05,
      removed: 3000,
      after: 485000,
    },
    multi_hit: {
      enabled: false,
      removed: 0,
      after: 485000,
    },
    xy_chromosomes: {
      enabled: false,
      removed: 0,
      after: 485000,
    },
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

describe("FilteringStats", () => {
  it("rendert aktivierte Filterstatistiken korrekt", () => {
    render(<FilteringStats stats={buildFilteringStats()} />);

    expect(screen.getByRole("heading", { name: "Filterstatistik" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sonden vorher" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Entfernt" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Verbleibend" })).toBeInTheDocument();

    expect(screen.getByRole("rowheader", { name: /Detection P-Value/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "SNP" })).toBeInTheDocument();
    expect(screen.queryByRole("rowheader", { name: "Bead Count" })).not.toBeInTheDocument();
    expect(screen.getAllByText("500.000").length).toBeGreaterThan(0);
    expect(screen.getByText("15.000")).toBeInTheDocument();
    expect(screen.getAllByText("485.000").length).toBeGreaterThan(0);
    expect(screen.getByText("Sample Quality Filter")).toBeInTheDocument();
  });

  it("faengt fehlende Statistikdaten ab", () => {
    render(<FilteringStats stats={null} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/Filterstatistik nicht verf/)).toBeInTheDocument();
    expect(
      screen.getByText("Die empfangenen Statistikdaten sind leer oder fehlerhaft."),
    ).toBeInTheDocument();
  });
});
