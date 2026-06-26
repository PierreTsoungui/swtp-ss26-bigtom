import { forwardRef, useMemo } from "react";
import type { PcaData } from "../utils/types";
import { NO_GROUP_COLOR, NO_GROUP_LABEL } from "../utils/pcaColors";

interface PcaPlotProps {
  data: PcaData;
  /** Group -> color. */
  groupColors: Record<string, string>;
  /** Sample -> color (overrides the group color for individual points). */
  sampleColors: Record<string, string>;
  /** Samples whose names are shown as point labels. */
  labeledSamples?: string[];
  showLegend?: boolean;
  width?: number;
  height?: number;
  /** Larger fonts for export/print (NRM-02). */
  fontScale?: number;
}

// Produces ~count "round" tick values across [min, max].
function niceTicks(min: number, max: number, count = 5): number[] {
  if (!isFinite(min) || !isFinite(max) || min === max) return [min];
  const span = max - min;
  const step = Math.pow(10, Math.floor(Math.log10(span / count)));
  const err = (span / count) / step;
  const mult = err >= 7.5 ? 10 : err >= 3 ? 5 : err >= 1.5 ? 2 : 1;
  const niceStep = mult * step;
  const start = Math.ceil(min / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = start; v <= max + niceStep * 1e-6; v += niceStep) {
    ticks.push(Math.round(v * 1000) / 1000);
  }
  return ticks;
}

/**
 * Renders a PCA scatter plot (PC1 vs. PC2) as SVG.
 *
 * SVG rather than a finished PNG on purpose: colours, labels and size are
 * produced in the frontend, can be changed any number of times (NRM-03) and the
 * rendered plot is exportable to PNG via the SVG ref (NRM-04). Font sizes and
 * contrast are chosen so the plot stays legible when printed (NRM-02).
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
  const points = data.points ?? [];
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

  const sx = (v: number) =>
    margin.left + ((v - layout.x.lo) / (layout.x.hi - layout.x.lo)) * plotW;
  const sy = (v: number) =>
    margin.top + plotH - ((v - layout.y.lo) / (layout.y.hi - layout.y.lo)) * plotH;

  const colorOf = (sample: string, group: string) =>
    sampleColors[sample] ??
    groupColors[group || NO_GROUP_LABEL] ??
    NO_GROUP_COLOR;

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
          <line x1={sx(t)} y1={margin.top} x2={sx(t)} y2={margin.top + plotH} stroke={GRID} strokeWidth={1} />
          <text x={sx(t)} y={margin.top + plotH + fs(20)} textAnchor="middle" fontSize={fs(13)} fill={TEXT}>
            {t}
          </text>
        </g>
      ))}

      {/* Grid + Y ticks */}
      {yTicks.map((t) => (
        <g key={`y-${t}`}>
          <line x1={margin.left} y1={sy(t)} x2={margin.left + plotW} y2={sy(t)} stroke={GRID} strokeWidth={1} />
          <text x={margin.left - 10} y={sy(t) + fs(5)} textAnchor="end" fontSize={fs(13)} fill={TEXT}>
            {t}
          </text>
        </g>
      ))}

      {/* Axis titles */}
      <text x={margin.left + plotW / 2} y={height - fs(16)} textAnchor="middle" fontSize={fs(17)} fontWeight={600} fill={TEXT}>
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
