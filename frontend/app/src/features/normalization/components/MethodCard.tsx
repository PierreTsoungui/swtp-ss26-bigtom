import { useMemo } from "react";
import type { MethodPreview, NormalizationMethod } from "../types";
import PcaPlot from "./PcaPlot";
import { defaultGroupColors } from "../utils/pcaColors";
import { PlotView, type PlotSource } from "../../../shared/plots";
import { Button } from "../../../shared/components/Button";

/**
 * Props for the MethodCard component.
 */
interface MethodCardProps {
  /** The preview data (Density URL and PCA dataset) for a specific normalization algorithm. */
  method: MethodPreview;
  /** Indicates if this specific method is currently selected by the user. */
  isSelected: boolean;
  /** Callback fired when the card or its select button is clicked. */
  onSelect: (method: NormalizationMethod) => void;
  /** Callback to trigger the interactive PCA viewer overlay. */
  onPcaClick: (method: MethodPreview) => void;
}

/**
 * A card component representing a single normalization method.
 *
 * It provides a comparative overview through:
 * 1. A static **Density Plot** (enlargeable on click).
 * 2. A mini **PCA Plot** (opens the interactive viewer on click).
 *
 * To ensure a smooth UX, clicking the card body selects the method, while clicks
 * on individual plots are intercepted (propagation stopped) to trigger their
 * respective diagnostic tools.
 */
function MethodCard({ method, isSelected, onSelect, onPcaClick }: MethodCardProps) {
  const { density_url, pca } = method;

  // Stable default group colors for the small preview (the viewer manages its
  // own interactive palette).
  const previewColors = useMemo(() => (pca?.points ? defaultGroupColors(pca.points) : {}), [pca]);

  // The density plot is a static PNG served by the backend; the matching PDF
  // lives next to it under the same name (density_<method>.png → .pdf).
  const densitySource: PlotSource | null = density_url
    ? {
        pngUrl: density_url,
        pdfUrl: density_url.replace(/\.png(\?.*)?$/, ".pdf"),
        title: `${method.method.toUpperCase()} – Density plot`,
        downloadName: `density_${method.method}`,
      }
    : null;

  const select = () => onSelect(method.method);

  return (
    <div
      onClick={select}
      className={`rounded-xl border-2 p-3 shadow-sm transition-all ${
        isSelected
          ? "border-primary bg-info-badgeBackground shadow-md"
          : "border-neutral-borderDefault bg-neutral-card hover:border-neutral-borderEmphasis"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide text-neutral-textPrimary">
          {method.method}
        </span>
        {isSelected && (
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-text"
          >
            ✓
          </span>
        )}
      </div>

      {/* Density plot (static PNG/PDF). Clicks must not bubble up and select
          the card, so the whole plot block stops propagation. */}
      <div
        className="mb-3"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {densitySource ? (
          <PlotView source={densitySource} maxHeightClass="max-h-40" exportSize="small" />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-md border border-neutral-borderDefault bg-neutral-surface text-sm text-neutral-textSecondary">
            no density plot
          </div>
        )}
        <div className="mt-1 text-center text-sm text-neutral-textSecondary">Density</div>
      </div>

      {/* PCA (interactive) */}
      <div>
        {pca && !pca.error && pca.points.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPcaClick(method);
            }}
            className="block w-full rounded-md border border-neutral-borderEmphasis bg-neutral-card transition hover:border-primary hover:shadow-md focus-visible:border-primary"
            aria-label={`Open ${method.method} PCA interactively`}
          >
            <PcaPlot
              data={pca}
              groupColors={previewColors}
              sampleColors={{}}
              labeledSamples={[]}
              showLegend={false}
              width={320}
              height={240}
            />
          </button>
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-md border border-neutral-borderDefault bg-neutral-surface text-sm text-neutral-textSecondary">
            {pca?.error ? `PCA: ${pca.error}` : "no PCA data"}
          </div>
        )}
        <div className="mt-1 text-center text-sm text-neutral-textSecondary">
          PCA • click to color & export
        </div>
      </div>

      {method.method === "raw" && (
        <div className="mt-3 text-center text-sm text-neutral-textSecondary">
          Raw data (no normalization)
        </div>
      )}

      {/* Explicit select action (mt-auto keeps it pinned to the card bottom). */}
      <Button
        variant={isSelected ? "primary" : "secondary"}
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
        aria-pressed={isSelected}
        className="mt-auto w-full"
      >
        {isSelected ? "✓ Selected" : "Select"}
      </Button>
    </div>
  );
}

export default MethodCard;
