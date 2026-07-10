import { describe, expect, it } from "vitest";

import { orderMethods } from "./orderMethods";
import type { MethodPreview, NormalizationMethod } from "../types";

/** Builds a minimal method preview for the given method name. */
function preview(method: NormalizationMethod): MethodPreview {
  return { method, density_url: null, pca: null };
}

describe("orderMethods", () => {
  it("sorts methods into the canonical order with raw first", () => {
    const input = [
      preview("funnorm"),
      preview("raw"),
      preview("noob"),
      preview("swan"),
      preview("quantile"),
    ];
    expect(orderMethods(input).map((m) => m.method)).toEqual([
      "raw",
      "noob",
      "quantile",
      "swan",
      "funnorm",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [preview("noob"), preview("raw")];
    const copy = [...input];
    orderMethods(input);
    expect(input).toEqual(copy);
  });

  it("places unknown methods after all known ones", () => {
    const input = [
      { method: "unknown" as NormalizationMethod, density_url: null, pca: null },
      preview("raw"),
    ];
    expect(orderMethods(input).map((m) => m.method)).toEqual(["raw", "unknown"]);
  });

  it("returns an empty array unchanged", () => {
    expect(orderMethods([])).toEqual([]);
  });
});
