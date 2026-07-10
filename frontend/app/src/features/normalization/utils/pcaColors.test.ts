import { describe, expect, it } from "vitest";

import {
  defaultGroupColors,
  NO_GROUP_COLOR,
  NO_GROUP_LABEL,
  PCA_PALETTE,
  uniqueGroups,
} from "./pcaColors";
import type { PcaPoint } from "../types";

/** Builds a PCA point with only the group set (coordinates are irrelevant here). */
function point(sample: string, group: string): PcaPoint {
  return { sample, group, pc1: 0, pc2: 0 };
}

describe("uniqueGroups", () => {
  it("returns groups in order of first appearance without duplicates", () => {
    const points = [point("s1", "B"), point("s2", "A"), point("s3", "B")];
    expect(uniqueGroups(points)).toEqual(["B", "A"]);
  });

  it("maps empty group names to the no-group label", () => {
    expect(uniqueGroups([point("s1", "")])).toEqual([NO_GROUP_LABEL]);
  });

  it("returns an empty array for no points", () => {
    expect(uniqueGroups([])).toEqual([]);
  });
});

describe("defaultGroupColors", () => {
  it("assigns palette colors to groups in order", () => {
    const colors = defaultGroupColors([point("s1", "A"), point("s2", "B")]);
    expect(colors.A).toBe(PCA_PALETTE[0]);
    expect(colors.B).toBe(PCA_PALETTE[1]);
  });

  it("uses the dedicated fallback color for the no-group bucket", () => {
    const colors = defaultGroupColors([point("s1", "")]);
    expect(colors[NO_GROUP_LABEL]).toBe(NO_GROUP_COLOR);
  });

  it("cycles through the palette when there are more groups than colors", () => {
    const points = Array.from({ length: PCA_PALETTE.length + 1 }, (_, i) =>
      point(`s${i}`, `G${i}`),
    );
    const colors = defaultGroupColors(points);
    // The (n+1)-th group wraps around to the first palette entry.
    expect(colors[`G${PCA_PALETTE.length}`]).toBe(PCA_PALETTE[0]);
  });
});
