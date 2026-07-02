import type { PcaPoint } from "./types";

/**
 * Kontrastreiche, gut unterscheidbare Farbpalette (kein Hellgrau), damit die
 * Punkte auch in Screenshots und Ausdrucken erkennbar sind (NRM-02).
 * Reihenfolge nach maximaler Unterscheidbarkeit gewählt.
 */
export const PCA_PALETTE: string[] = [
  "#1f77b4", // blau
  "#d62728", // rot
  "#2ca02c", // grün
  "#ff7f0e", // orange
  "#9467bd", // violett
  "#17becf", // türkis
  "#bcbd22", // oliv
  "#e377c2", // pink
  "#8c564b", // braun
  "#393b79", // dunkelblau
];

/** Farbe für Punkte ohne erkennbare Gruppe. */
export const NO_GROUP_COLOR = "#555555";

/** Display name for points without a group. */
export const NO_GROUP_LABEL = "No group";

/** Eindeutige Gruppen in stabiler Reihenfolge (Reihenfolge des Auftretens). */
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

/** Weist jeder Gruppe eine Palettenfarbe zu (zyklisch bei vielen Gruppen). */
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
