import type { GroupSelection, SampleSheetColumn } from "../types";

/**
 * Pure helpers for the {@link BatchForm}'s local selection logic.
 *
 * They contain no React or I/O and derive the form's sensible defaults and
 * validation purely from the metadata columns, so the component stays thin and
 * the rules can be unit-tested in isolation.
 */

/**
 * Looks up a column by name.
 *
 * @param columns - All available metadata columns.
 * @param name - The column name to find.
 * @returns The matching column, or `undefined` if none matches.
 */
export function findColumn(
  columns: SampleSheetColumn[],
  name: string,
): SampleSheetColumn | undefined {
  return columns.find((column) => column.name === name);
}

/**
 * Returns the distinct group values of a column.
 *
 * @param columns - All available metadata columns.
 * @param name - The column name to read values from.
 * @returns The column's values, or an empty array if the column is unknown.
 */
export function valuesOf(columns: SampleSheetColumn[], name: string): string[] {
  return findColumn(columns, name)?.values ?? [];
}

/**
 * Returns the number of distinct levels of a column, if known.
 *
 * @param columns - All available metadata columns.
 * @param name - The column name to inspect.
 * @returns The level count, or `undefined` if the column is unknown.
 */
export function levelsOf(columns: SampleSheetColumn[], name: string): number | undefined {
  return findColumn(columns, name)?.levels;
}

/**
 * Derives the default case/control comparison from the available columns.
 *
 * The first column is chosen, with its first value as the control (reference)
 * and its second value as the case (treatment). Missing values fall back to an
 * empty string.
 *
 * @param columns - All available metadata columns.
 * @returns A default {@link GroupSelection}; all fields are `""` when no columns
 *   are available.
 */
export function defaultGroupSelection(columns: SampleSheetColumn[]): GroupSelection {
  const first = columns[0];
  return {
    group_column: first?.name ?? "",
    control_group: first?.values[0] ?? "",
    case_group: first?.values[1] ?? "",
  };
}

/**
 * Whether the chosen comparison is valid for differential analysis.
 *
 * A comparison is ready once a column and two *distinct*, non-empty groups have
 * been selected.
 *
 * @param selection - The current comparison selection.
 * @returns `true` if the selection can be submitted for analysis.
 */
export function isComparisonReady(selection: GroupSelection): boolean {
  const { group_column, case_group, control_group } = selection;
  return (
    group_column !== "" && case_group !== "" && control_group !== "" && case_group !== control_group
  );
}
