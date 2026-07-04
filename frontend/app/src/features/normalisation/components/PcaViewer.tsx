import { useMemo, useRef, useState } from "react";
import type { PcaData } from "../utils/types";
import PcaPlot from "./PcaPlot";
import { defaultGroupColors, uniqueGroups } from "../utils/pcaColors";
import { exportSvgAsPng } from "../utils/exportSvg";
import { exportSvgAsPdf } from "../utils/exportSvgAsPdf";

/**
 * Interface for the props of the PcaViewer component.
 */
interface PcaViewerProps {
  method: string;
  data: PcaData;
  onClose: () => void;
}

/**
 * Palette of high-contrast colors for manual point highlighting.
 */
const COLOR_OPTIONS: { name: string; value: string }[] = [
  { name: "Blue", value: "#1f77b4" },
  { name: "Red", value: "#d62728" },
  { name: "Green", value: "#2ca02c" },
  { name: "Orange", value: "#ff7f0e" },
  { name: "Purple", value: "#9467bd" },
  { name: "Teal", value: "#17becf" },
  { name: "Pink", value: "#e377c2" },
  { name: "Brown", value: "#8c564b" },
  { name: "Black", value: "#000000" },
];

const PLOT_W = 820;
const PLOT_H = 600;

/**
 * Supported export formats for the interactive PCA plot. Adding a new format is
 * a single entry here — the handler and buttons are driven off this registry.
 *  - PNG: rasterised via canvas (small, universally viewable).
 *  - PDF: true vector output, matching the R-generated PDFs of every other plot.
 */
type ExportFormat = "png" | "pdf";

const EXPORTERS: Record<
  ExportFormat,
  { label: string; run: (svg: SVGSVGElement, basename: string) => Promise<void> }
> = {
  png: {
    label: "PNG",
    run: (svg, basename) =>
      exportSvgAsPng(svg, `${basename}.png`, PLOT_W, PLOT_H, 2),
  },
  pdf: {
    label: "PDF",
    run: (svg, basename) =>
      exportSvgAsPdf(svg, `${basename}.pdf`, PLOT_W, PLOT_H),
  },
};

// Render order of the export buttons (PDF sits directly under PNG).
const EXPORT_ORDER: ExportFormat[] = ["png", "pdf"];

/**
 * Modal with an interactive PCA plot and a side menu (NRM-03/NRM-04):
 *  - points are coloured by sample group by default,
 *  - each group can be recoloured any number of times,
 *  - individual points (samples) can be highlighted via two dropdowns and then
 *    appear in the legend with their own colour,
 *  - point labels can be shown selectively (pick which samples to label, so a
 *    single outlier can be named without cluttering the plot),
 *  - the finished plot is exportable as PNG.
 */
function PcaViewer({ method, data, onClose }: PcaViewerProps) {
  const groups = useMemo(() => uniqueGroups(data.points), [data.points]);
  const samples = useMemo(() => data.points.map((p) => p.sample), [data.points]);

  const [groupColors, setGroupColors] = useState<Record<string, string>>(() =>
    defaultGroupColors(data.points),
  );
  const [sampleColors, setSampleColors] = useState<Record<string, string>>({});
  const [labeledSamples, setLabeledSamples] = useState<string[]>([]);

  // State of the two override dropdowns.
  const [selectedSample, setSelectedSample] = useState<string>(samples[0] ?? "");
  const [selectedColor, setSelectedColor] = useState<string>(COLOR_OPTIONS[0].value);

  // State of the "add label" dropdown (samples not yet labeled).
  const unlabeled = useMemo(
    () => samples.filter((s) => !labeledSamples.includes(s)),
    [samples, labeledSamples],
  );
  const [labelToAdd, setLabelToAdd] = useState<string>("");

  const svgRef = useRef<SVGSVGElement>(null);
  // Which export is currently running (null = idle). Shared across formats so
  // both buttons disable while any export is in flight — and so a new format
  // can be added by extending EXPORTERS below without touching the UI wiring.
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);

  const applyOverride = () => {
    if (!selectedSample) return;
    setSampleColors((prev) => ({ ...prev, [selectedSample]: selectedColor }));
  };

  const removeOverride = (sample: string) => {
    setSampleColors((prev) => {
      const next = { ...prev };
      delete next[sample];
      return next;
    });
  };

  const addLabel = (sample: string) => {
    if (sample && !labeledSamples.includes(sample)) {
      setLabeledSamples((prev) => [...prev, sample]);
    }
    setLabelToAdd("");
  };

  const removeLabel = (sample: string) =>
    setLabeledSamples((prev) => prev.filter((s) => s !== sample));

  const resetAll = () => {
    setGroupColors(defaultGroupColors(data.points));
    setSampleColors({});
  };

  const handleExport = async (format: ExportFormat) => {
    if (!svgRef.current || exportingFormat) return;
    setExportingFormat(format);
    try {
      await EXPORTERS[format].run(svgRef.current, `pca_${method}`);
    } catch (err) {
      // The export utilities throw on failure; surface it rather than failing
      // silently. A toast system could replace this later.
      console.error(`PCA ${format.toUpperCase()} export failed`, err);
      alert(`Could not export the plot as ${format.toUpperCase()}.`);
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-textPrimary/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-neutral-card shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-surface text-lg font-bold shadow hover:bg-neutral-borderDefault"
        >
          ✕
        </button>

        {/* Plot */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-white p-4">
          <PcaPlot
            ref={svgRef}
            data={data}
            groupColors={groupColors}
            sampleColors={sampleColors}
            labeledSamples={labeledSamples}
            width={PLOT_W}
            height={PLOT_H}
          />
        </div>

        {/* Side menu */}
        <aside className="w-full shrink-0 space-y-5 overflow-y-auto border-t border-neutral-borderDefault bg-neutral-card p-5 md:w-80 md:border-l md:border-t-0">
          <h3 className="text-lg font-semibold text-neutral-textPrimary">
            PCA · {method.toUpperCase()}
          </h3>

          {/* Group colours */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-neutral-textPrimary">Color by group</p>
            {groups.map((g) => (
              <div key={g} className="flex items-center justify-between gap-2">
                <span className="truncate text-sm text-neutral-textSecondary" title={g}>
                  {g}
                </span>
                <input
                  type="color"
                  value={groupColors[g] ?? "#1f77b4"}
                  onChange={(e) =>
                    setGroupColors((prev) => ({ ...prev, [g]: e.target.value }))
                  }
                  className="h-7 w-10 cursor-pointer rounded border"
                  aria-label={`Color for group ${g}`}
                />
              </div>
            ))}
          </div>

          {/* Highlight a single point – two dropdowns */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-neutral-textPrimary">
              Highlight a single point
            </p>
            <select
              value={selectedSample}
              onChange={(e) => setSelectedSample(e.target.value)}
              className="w-full rounded border border-neutral-borderDefault bg-neutral-card p-2 text-sm"
              aria-label="Select sample"
            >
              {samples.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <select
                value={selectedColor}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="flex-1 rounded border border-neutral-borderDefault bg-neutral-card p-2 text-sm"
                aria-label="Select color"
              >
                {COLOR_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span
                className="h-7 w-7 shrink-0 rounded border"
                style={{ backgroundColor: selectedColor }}
                aria-hidden
              />
            </div>
            <button
              onClick={applyOverride}
              className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-text hover:bg-primary-hover"
            >
              Apply color
            </button>

            {Object.keys(sampleColors).length > 0 && (
              <ul className="space-y-1 pt-1">
                {Object.entries(sampleColors).map(([s, c]) => (
                  <li key={s} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 truncate">
                      <span className="inline-block h-3 w-3 rounded" style={{ backgroundColor: c }} />
                      {s}
                    </span>
                    <button onClick={() => removeOverride(s)} className="text-danger hover:underline">
                      remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Point labels – choose which samples to name */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-textPrimary">Point labels</p>
              <div className="flex gap-2 text-xs">
                <button
                  onClick={() => setLabeledSamples(samples)}
                  className="text-primary hover:underline"
                >
                  Show all
                </button>
                <button
                  onClick={() => setLabeledSamples([])}
                  className="text-primary hover:underline"
                >
                  Hide all
                </button>
              </div>
            </div>
            <select
              value={labelToAdd}
              onChange={(e) => addLabel(e.target.value)}
              className="w-full rounded border border-neutral-borderDefault bg-neutral-card p-2 text-sm disabled:opacity-60"
              aria-label="Add a point label"
              disabled={unlabeled.length === 0}
            >
              <option value="">
                {unlabeled.length === 0 ? "All points labeled" : "Add label for…"}
              </option>
              {unlabeled.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {labeledSamples.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {labeledSamples.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1 rounded-full bg-neutral-surface px-2 py-0.5 text-xs"
                  >
                    {s}
                    <button
                      onClick={() => removeLabel(s)}
                      aria-label={`Remove label ${s}`}
                      className="font-bold text-danger"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2 border-t border-neutral-borderDefault pt-3">
            {EXPORT_ORDER.map((format) => (
              <button
                key={format}
                onClick={() => void handleExport(format)}
                disabled={exportingFormat !== null}
                className="w-full rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-text hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {exportingFormat === format
                  ? "Exporting…"
                  : `Export as ${EXPORTERS[format].label}`}
              </button>
            ))}
            <button
              onClick={resetAll}
              className="w-full rounded-lg border border-neutral-borderEmphasis px-3 py-2 text-sm font-semibold text-neutral-textSecondary hover:bg-neutral-surface"
            >
              Reset colors
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default PcaViewer;
