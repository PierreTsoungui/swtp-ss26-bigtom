import { forwardRef, useMemo } from "react";
import type { PcaData } from "../types";
import { NO_GROUP_COLOR, NO_GROUP_LABEL } from "../utils/pcaColors";
import { niceTicks } from "../utils/niceTicks";

/**
 * Props for the PcaPlot component.
 */
interface PcaPlotProps {
  /** The PCA dataset including point coordinates and variance explained. */
  data: PcaData;
  /** Mapping of group names to their respective theme colors. */
  groupColors: Record<string, string>;
  /** Mapping of sample IDs to specific colors (overrides group-level coloring). */
  sampleColors: Record<string, string>;
  /** List of samples that should be explicitly labeled on the plot. */
  labeledSamples?: string[];
  /** Whether to display the legend on the right side of the plot. */
  showLegend?: boolean;
  /** Total width of the SVG element. */
  width?: number;
  /** Total height of the SVG element. */
  height?: number;
  /** Global font scale multiplier for high-resolution exports. */
  fontScale?: number;
}

/**
 * Renders an interactive PCA scatter plot as a scalable vector graphic (SVG).
 *
 * **Key Features:**
 * - **Dynamic Styling**: Colors, labels, and sizing are applied client-side for instant updates.
 * - **Print Readiness**: High-contrast colors and scalable fonts ensure legibility in publications.
 * - **Exportable**: The SVG ref can be used to capture high-density PNG snapshots.
 *
 * @remarks
 * Using SVG instead of a canvas or pre-rendered image allows for precise control
 * over individual elements and seamless integration with CSS/JS for tooltips.
 */
const PcaPlot = forwardRef<SVGSVGElement, PcaPlotProps>(function PcaPlot(
  {
    data,
    groupColors,
    sampleColors,
    labeledSamples = [],
    showLegend = true,
    width = 760,
    height = 560,
    fontScale = 1,
  },
  ref,
) {
  const points = useMemo(() => data.points ?? [], [data.points]);
  const labeled = useMemo(() => new Set(labeledSamples), [labeledSamples]);

  const layout = useMemo(() => {
    const xs = points.map((p) => p.pc1);
    const ys = points.map((p) => p.pc2);
    const pad = (vals: number[]) => {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      const margin = (hi - lo || 1) * 0.08;
      return { lo: lo - margin, hi: hi + margin };
    };
    return points.length
      ? { x: pad(xs), y: pad(ys) }
      : { x: { lo: 0, hi: 1 }, y: { lo: 0, hi: 1 } };
  }, [points]);

  // Legend = one entry per group plus one per per-point colour override, so a
  // highlighted outlier shows up with its own colour just like the groups (NRM-03).
  const legendEntries = useMemo(
    () => [
      ...Object.entries(groupColors).map(([name, color]) => ({ name, color })),
      ...Object.entries(sampleColors).map(([name, color]) => ({ name, color })),
    ],
    [groupColors, sampleColors],
  );

  if (data.error) {
    return (
      <div className="flex h-40 w-full items-center justify-center rounded-md border border-danger bg-danger-badgeBackground p-3 text-center text-sm text-danger-badgeText">
        PCA not available: {data.error}
      </div>
    );
  }
  if (!points.length) {
    return (
      <div className="flex h-40 w-full items-center justify-center rounded-md border bg-neutral-surface text-sm text-neutral-textDisabled">
        No PCA data
      </div>
    );
  }

  const legendW = showLegend ? 180 : 0;
  const margin = { top: 44, right: 24 + legendW, bottom: 64, left: 76 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const sx = (v: number) => margin.left + ((v - layout.x.lo) / (layout.x.hi - layout.x.lo)) * plotW;
  const sy = (v: number) =>
    margin.top + plotH - ((v - layout.y.lo) / (layout.y.hi - layout.y.lo)) * plotH;

  const colorOf = (sample: string, group: string) =>
    sampleColors[sample] ?? groupColors[group || NO_GROUP_LABEL] ?? NO_GROUP_COLOR;

  const ve = data.variance_explained;
  const xTitle = `PC1${ve ? ` (${ve.pc1}%)` : ""}`;
  const yTitle = `PC2${ve ? ` (${ve.pc2}%)` : ""}`;

  const fs = (px: number) => Math.round(px * fontScale);
  const TEXT = "#1a1a1a"; // high contrast, no light gray
  const GRID = "#d4d4d4";
  const AXIS = "#333333";

  const xTicks = niceTicks(layout.x.lo, layout.x.hi);
  const yTicks = niceTicks(layout.y.lo, layout.y.hi);

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ background: "#ffffff", fontFamily: "Arial, sans-serif", maxWidth: "100%" }}
    >
      {/* Plot frame */}
      <rect
        x={margin.left}
        y={margin.top}
        width={plotW}
        height={plotH}
        fill="#ffffff"
        stroke={AXIS}
        strokeWidth={1.5}
      />

      {/* Grid + X ticks */}
      {xTicks.map((t) => (
        <g key={`x-${t}`}>
          <line
            x1={sx(t)}
            y1={margin.top}
            x2={sx(t)}
            y2={margin.top + plotH}
            stroke={GRID}
            strokeWidth={1}
          />
          <text
            x={sx(t)}
            y={margin.top + plotH + fs(20)}
            textAnchor="middle"
            fontSize={fs(13)}
            fill={TEXT}
          >
            {t}
          </text>
        </g>
      ))}

      {/* Grid + Y ticks */}
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line
            x1={margin.left}
            y1={sy(t)}
            x2={margin.left + plotW}
            y2={sy(t)}
            stroke={GRID}
            strokeWidth={1}
          />
          <text
            x={margin.left - 10}
            y={sy(t) + fs(5)}
            textAnchor="end"
            fontSize={fs(13)}
            fill={TEXT}
          >
            {t}
          </text>
        </g>
      ))}

      {/* Axis titles */}
      <text
        x={margin.left + plotW / 2}
        y={height - fs(16)}
        textAnchor="middle"
        fontSize={fs(17)}
        fontWeight={600}
        fill={TEXT}
      >
        {xTitle}
      </text>
      <text
        x={fs(20)}
        y={margin.top + plotH / 2}
        textAnchor="middle"
        fontSize={fs(17)}
        fontWeight={600}
        fill={TEXT}
        transform={`rotate(-90 ${fs(20)} ${margin.top + plotH / 2})`}
      >
        {yTitle}
      </text>

      {/* Points + optional labels */}
      {points.map((p, i) => {
        const cx = sx(p.pc1);
        const cy = sy(p.pc2);
        const fill = colorOf(p.sample, p.group);
        return (
          <g key={`${p.sample}-${i}`}>
            <circle cx={cx} cy={cy} r={6} fill={fill} stroke="#ffffff" strokeWidth={1.2}>
              <title>{`${p.sample}${p.group ? ` (${p.group})` : ""}`}</title>
            </circle>
            {labeled.has(p.sample) && (
              <text x={cx + 9} y={cy + fs(4)} fontSize={fs(12)} fontWeight={600} fill={TEXT}>
                {p.sample}
              </text>
            )}
          </g>
        );
      })}

      {/* Legend (groups + highlighted points) */}
      {showLegend && legendEntries.length > 0 && (
        <g transform={`translate(${width - legendW + 8}, ${margin.top})`}>
          <text x={0} y={0} fontSize={fs(14)} fontWeight={700} fill={TEXT}>
            Legend
          </text>
          {legendEntries.map((entry, i) => (
            <g key={`${entry.name}-${i}`} transform={`translate(0, ${fs(18) + i * fs(22)})`}>
              <rect x={0} y={-fs(11)} width={fs(14)} height={fs(14)} rx={3} fill={entry.color} />
              <text x={fs(20)} y={0} fontSize={fs(13)} fill={TEXT}>
                {entry.name}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
});

export default PcaPlot;
