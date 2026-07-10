import { describe, expect, it } from "vitest";

import type { SampleSheetColumn } from "../types";
import {
  defaultGroupSelection,
  findColumn,
  isComparisonReady,
  levelsOf,
  valuesOf,
} from "./batchForm";

const columns: SampleSheetColumn[] = [
  { name: "Sample_Group", levels: 2, values: ["Control", "Cancer"] },
  { name: "Sentrix_ID", levels: 4, values: ["ID1", "ID2", "ID3", "ID4"] },
];

describe("findColumn", () => {
  it("returns the matching column", () => {
    expect(findColumn(columns, "Sentrix_ID")?.levels).toBe(4);
  });

  it("returns undefined for an unknown column", () => {
    expect(findColumn(columns, "Missing")).toBeUndefined();
  });
});

describe("valuesOf", () => {
  it("returns the column's values", () => {
    expect(valuesOf(columns, "Sample_Group")).toEqual(["Control", "Cancer"]);
  });

  it("returns an empty array for an unknown column", () => {
    expect(valuesOf(columns, "Missing")).toEqual([]);
  });
});

describe("levelsOf", () => {
  it("returns the level count for a known column", () => {
    expect(levelsOf(columns, "Sentrix_ID")).toBe(4);
  });

  it("returns undefined for an unknown column", () => {
    expect(levelsOf(columns, "Missing")).toBeUndefined();
  });
});

describe("defaultGroupSelection", () => {
  it("uses the first column with control=values[0] and case=values[1]", () => {
    expect(defaultGroupSelection(columns)).toEqual({
      group_column: "Sample_Group",
      control_group: "Control",
      case_group: "Cancer",
    });
  });

  it("falls back to empty strings when there are no columns", () => {
    expect(defaultGroupSelection([])).toEqual({
      group_column: "",
      control_group: "",
      case_group: "",
    });
  });

  it("falls back to empty strings when the column lacks a second value", () => {
    expect(defaultGroupSelection([{ name: "One", levels: 1, values: ["only"] }])).toEqual({
      group_column: "One",
      control_group: "only",
      case_group: "",
    });
  });
});

describe("isComparisonReady", () => {
  it("is true for two distinct, non-empty groups", () => {
    expect(isComparisonReady({ group_column: "g", case_group: "a", control_group: "b" })).toBe(
      true,
    );
  });

  it("is false when the two groups are identical", () => {
    expect(isComparisonReady({ group_column: "g", case_group: "a", control_group: "a" })).toBe(
      false,
    );
  });

  it("is false when any field is empty", () => {
    expect(isComparisonReady({ group_column: "", case_group: "a", control_group: "b" })).toBe(
      false,
    );
    expect(isComparisonReady({ group_column: "g", case_group: "", control_group: "b" })).toBe(
      false,
    );
    expect(isComparisonReady({ group_column: "g", case_group: "a", control_group: "" })).toBe(
      false,
    );
  });
});
