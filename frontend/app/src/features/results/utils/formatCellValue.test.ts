import { describe, expect, it } from "vitest";

import { formatCellValue } from "./formatCellValue";

describe("formatCellValue", () => {
  it("renders null and undefined as an em dash", () => {
    expect(formatCellValue(null, "float")).toBe("—");
    expect(formatCellValue(undefined, "string")).toBe("—");
  });

  it("uses exponential notation for very small non-zero floats", () => {
    expect(formatCellValue(0.000023456, "float")).toBe("2.3456e-5");
  });

  it("keeps exact zero as '0'", () => {
    expect(formatCellValue(0, "float")).toBe("0");
  });

  it("trims trailing zeros for normal floats", () => {
    expect(formatCellValue(1.25, "float")).toBe("1.25");
    expect(formatCellValue(2, "float")).toBe("2");
  });

  it("stringifies non-numeric values even for float columns", () => {
    expect(formatCellValue("not_a_number", "float")).toBe("not_a_number");
  });

  it("stringifies non-float column values as-is", () => {
    expect(formatCellValue("cg0001", "string")).toBe("cg0001");
    expect(formatCellValue(42, "integer")).toBe("42");
  });
});
