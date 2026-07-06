import type { TableCellValue } from "../types";

/**
 * Formats a raw table cell value for display based on its declared column type.
 *
 * Special handling for `"float"` columns:
 * - Uses **exponential notation** for very small non-zero magnitudes (`< 0.0001`)
 *   so p-values and effect sizes stay scientifically readable.
 * - Otherwise fixes to four decimals and trims trailing zeros for a clean look.
 *
 * `null`/`undefined` render as an em dash. Non-numeric values (and non-float
 * columns) are stringified as-is.
 *
 * @param value - The raw cell value.
 * @param type - The column's value type (e.g. `"float"`, `"string"`).
 * @returns The display string for the cell.
 */
export function formatCellValue(value: TableCellValue | undefined, type: string): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (type === "float" && typeof value === "number") {
    if (Math.abs(value) < 0.0001 && value !== 0) {
      return value.toExponential(4);
    }
    const formatted = value.toFixed(4).replace(/\.?0+$/, "");
    return formatted || "0";
  }

  return String(value);
}
