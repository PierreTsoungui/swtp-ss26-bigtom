import { describe, expect, it } from "vitest";
import type { FilteringStatsType } from "../types";
import { buildFilterSteps } from "./filterSteps";

/** Builds a filtering-stats fixture with every probe filter disabled by default. */
function stats(overrides: Partial<FilteringStatsType> = {}): FilteringStatsType {
  return {
    total_start: 1000,
    total_removed: 0,
    total_end: 1000,
    det_p: { enabled: false, cutoff: 0.01, removed: 0, after: 1000 },
    bead_count: { enabled: false, bead_cutoff: 0.05, removed: 0, after: 1000 },
    non_cpg: { enabled: false, removed: 0, after: 1000 },
    snp: { enabled: false, maf_cutoff: 0.05, removed: 0, after: 1000 },
    multi_hit: { enabled: false, removed: 0, after: 1000 },
    xy_chromosomes: { enabled: false, removed: 0, after: 1000 },
    sample_quality: {
      enabled: false,
      detection_p_cutoff: 0.01,
      sample_failure_rate: 0.1,
      enable_pca_outlier_detection: false,
      remove_failed_samples: false,
      samples_before: 10,
      samples_after: 10,
      samples_removed: 0,
    },
    ...overrides,
  };
}

describe("buildFilterSteps", () => {
  it("returns no rows when every probe filter is disabled", () => {
    expect(buildFilterSteps(stats())).toEqual([]);
  });

  it("includes only enabled filters", () => {
    const result = buildFilterSteps(
      stats({
        det_p: { enabled: true, cutoff: 0.01, removed: 5, after: 995 },
        snp: { enabled: true, maf_cutoff: 0.05, removed: 3, after: 992 },
      }),
    );
    expect(result.map((step) => step.name)).toEqual(["Detection P-Value", "SNP"]);
  });

  it("preserves the canonical display order regardless of which are enabled", () => {
    const result = buildFilterSteps(
      stats({
        xy_chromosomes: { enabled: true, removed: 1, after: 999 },
        det_p: { enabled: true, cutoff: 0.01, removed: 1, after: 999 },
        multi_hit: { enabled: true, removed: 1, after: 999 },
      }),
    );
    expect(result.map((step) => step.name)).toEqual([
      "Detection P-Value",
      "Multi-Hit",
      "XY Chromosomes",
    ]);
  });

  it("maps the label and parameter value for parametric filters", () => {
    const [step] = buildFilterSteps(
      stats({ det_p: { enabled: true, cutoff: 0.02, removed: 10, after: 990 } }),
    );
    expect(step).toEqual({
      name: "Detection P-Value",
      label: "Cutoff",
      labelValue: 0.02,
      removed: 10,
      after: 990,
    });
  });

  it("omits label/value for non-parametric filters", () => {
    const step = buildFilterSteps(
      stats({ non_cpg: { enabled: true, removed: 4, after: 996 } }),
    )[0]!;
    expect(step.name).toBe("Non-CpG");
    expect(step.label).toBeUndefined();
    expect(step.labelValue).toBeUndefined();
    expect(step.removed).toBe(4);
    expect(step.after).toBe(996);
  });
});
