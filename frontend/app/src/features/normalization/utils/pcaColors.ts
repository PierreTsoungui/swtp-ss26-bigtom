import type { PcaPoint } from "../types";

/**
 * Single source of truth for the PCA plot colours.
 *
 * These are perceptually distinct, print-safe encoding hues (the classic
 * matplotlib/D3 "category10"-style palette). They are deliberately kept outside
 * the app's Tailwind design tokens because they encode *data*, not UI chrome.
 * Every PCA colour — whether auto-assigned to a group ({@link PCA_PALETTE}) or
 * offered in the manual picker ({@link PCA_COLOR_OPTIONS}) — resolves to one of
 * these named values, so no hex literal is ever duplicated.
 */
export const PCA_COLORS = {
  blue: "#1f77b4",
  red: "#d62728",
  green: "#2ca02c",
  orange: "#ff7f0e",
  purple: "#9467bd",
  teal: "#17becf",
  olive: "#bcbd22",
  pink: "#e377c2",
  brown: "#8c564b",
  navy: "#393b79",
  black: "#000000",
} as const;

/**
 * Ordered palette used to auto-assign a colour to each sample group; cycled when
 * the group count exceeds its length. Excludes the neutral black, which is
 * reserved for manual emphasis in the picker.
 */
export const PCA_PALETTE: readonly string[] = [
  PCA_COLORS.blue,
  PCA_COLORS.red,
  PCA_COLORS.green,
  PCA_COLORS.orange,
  PCA_COLORS.purple,
  PCA_COLORS.teal,
  PCA_COLORS.olive,
  PCA_COLORS.pink,
  PCA_COLORS.brown,
  PCA_COLORS.navy,
];

/** A single named colour offered in the manual point-highlight picker. */
export interface PcaColorOption {
  /** Human-readable label shown in the dropdown. */
  name: string;
  /** The hex value applied to the highlighted point. */
  value: string;
}

/**
 * Named colours offered in the interactive point-highlight dropdown — a curated
 * subset of {@link PCA_COLORS} (the most easily distinguished hues plus black).
 */
export const PCA_COLOR_OPTIONS: readonly PcaColorOption[] = [
  { name: "Blue", value: PCA_COLORS.blue },
  { name: "Red", value: PCA_COLORS.red },
  { name: "Green", value: PCA_COLORS.green },
  { name: "Orange", value: PCA_COLORS.orange },
  { name: "Purple", value: PCA_COLORS.purple },
  { name: "Teal", value: PCA_COLORS.teal },
  { name: "Pink", value: PCA_COLORS.pink },
  { name: "Brown", value: PCA_COLORS.brown },
  { name: "Black", value: PCA_COLORS.black },
];

/** Fallback color for samples without a designated group. */
export const NO_GROUP_COLOR = "#555555";

/** Fallback label for samples without a designated group. */
export const NO_GROUP_LABEL = "No group";

/** Unique groups in a stable order (order of appearance). */
export function uniqueGroups(points: PcaPoint[]): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];
  for (const p of points) {
    const g = p.group || NO_GROUP_LABEL;
    if (!seen.has(g)) {
      seen.add(g);
      groups.push(g);
    }
  }
  return groups;
}

/**
 * Maps each group to a palette color.
 * Cycles through the {@link PCA_PALETTE} if the group count exceeds the palette size.
 */
export function defaultGroupColors(points: PcaPoint[]): Record<string, string> {
  const colors: Record<string, string> = {};
  uniqueGroups(points).forEach((group, i) => {
    colors[group] =
      group === NO_GROUP_LABEL
        ? NO_GROUP_COLOR :
          (PCA_PALETTE[i % PCA_PALETTE.length] ?? NO_GROUP_COLOR);
  });
  return colors;
}
