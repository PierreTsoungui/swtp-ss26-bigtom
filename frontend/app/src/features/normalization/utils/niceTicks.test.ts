import { describe, expect, it } from "vitest";

import { niceTicks } from "./niceTicks";

describe("niceTicks", () => {
  it("returns a single tick for a degenerate (zero-width) range", () => {
    expect(niceTicks(5, 5)).toEqual([5]);
  });

  it("returns a single tick when a bound is non-finite", () => {
    expect(niceTicks(Number.NaN, 10)).toEqual([Number.NaN]);
    expect(niceTicks(0, Number.POSITIVE_INFINITY)).toEqual([0]);
  });

  it("produces round, evenly spaced ticks covering the range", () => {
    const ticks = niceTicks(0, 10);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(10);
    // Equal spacing at a "nice" step.
    const step = ticks[1]! - ticks[0]!;
    for (let i = 1; i < ticks.length; i++) {
      expect(Math.round((ticks[i]! - ticks[i - 1]!) * 1000) / 1000).toBe(step);
    }
    expect([1, 2, 2.5, 5]).toContain(step);
  });

  it("handles fractional ranges typical of PCA coordinates", () => {
    const ticks = niceTicks(-0.2, 0.2);
    expect(ticks.length).toBeGreaterThan(1);
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(-0.2);
    expect(Math.max(...ticks)).toBeLessThanOrEqual(0.2);
  });

  it("respects the requested approximate tick count", () => {
    const few = niceTicks(0, 100, 2);
    const many = niceTicks(0, 100, 10);
    expect(many.length).toBeGreaterThan(few.length);
  });
});
