import type { PcaPoint } from "./types";

/**
 * High-contrast color palette optimized for accessibility and print visibility.
 * Colors are selected for maximum distinctness to ensure points remain
 * recognizable in screenshots and publications.
 */
export const PCA_PALETTE: string[] = [
  "#1f77b4", // blue
  "#d62728", // red
  "#2ca02c", // green
  "#ff7f0e", // orange
  "#9467bd", // purple
  "#17becf", // cyan
  "#bcbd22", // olive
  "#e377c2", // pink
  "#8c564b", // brown
  "#393b79", // dark blue
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
        ? NO_GROUP_COLOR
        : PCA_PALETTE[i % PCA_PALETTE.length];
  });
  return colors;
}
