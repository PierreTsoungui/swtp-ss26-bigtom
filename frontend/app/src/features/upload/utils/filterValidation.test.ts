import { describe, expect, it } from "vitest";

import { clampValue, FILTER_CONSTRAINTS, validateFilterValue } from "./filterValidation";

describe("validateFilterValue", () => {
  it("accepts a value within the range", () => {
    expect(validateFilterValue(0.03, 0.01, 0.05)).toEqual({ isValid: true });
  });

  it("accepts the exact boundaries", () => {
    expect(validateFilterValue(0.01, 0.01, 0.05).isValid).toBe(true);
    expect(validateFilterValue(0.05, 0.01, 0.05).isValid).toBe(true);
  });

  it("rejects a value below the minimum with an English message", () => {
    expect(validateFilterValue(0.005, 0.01, 0.05)).toEqual({
      isValid: false,
      error: "Value must be at least 0.01",
    });
  });

  it("rejects a value above the maximum with an English message", () => {
    expect(validateFilterValue(0.09, 0.01, 0.05)).toEqual({
      isValid: false,
      error: "Value must be at most 0.05",
    });
  });
});

describe("clampValue", () => {
  it("returns the value when inside the range", () => {
    expect(clampValue(0.03, 0.01, 0.05)).toBe(0.03);
  });

  it("clamps to the minimum and maximum", () => {
    expect(clampValue(-1, 0.01, 0.05)).toBe(0.01);
    expect(clampValue(9, 0.01, 0.05)).toBe(0.05);
  });
});

describe("FILTER_CONSTRAINTS", () => {
  it("defines coherent min/max bounds for every constrained filter", () => {
    expect(FILTER_CONSTRAINTS.det_p.cutoff.min).toBeLessThan(FILTER_CONSTRAINTS.det_p.cutoff.max);
    expect(FILTER_CONSTRAINTS.snp.maf_cutoff.max).toBe(0.5);
    expect(FILTER_CONSTRAINTS.sample_quality.sample_failure_rate.min).toBe(0.05);
  });
});
