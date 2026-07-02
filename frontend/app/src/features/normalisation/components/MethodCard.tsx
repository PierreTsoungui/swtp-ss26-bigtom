import { useMemo } from "react";
import type { MethodPreview, NormalizationMethod } from "../utils/types";
import PcaPlot from "./PcaPlot";
import { defaultGroupColors } from "../utils/pcaColors";

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
  /** Callback to open the static density plot in a full-screen modal. */
  onDensityClick: (url: string, title: string) => void;
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
function MethodCard({
  method,
  isSelected,
  onSelect,
  onDensityClick,
  onPcaClick,
}: MethodCardProps) {
  const { density_url, pca } = method;

  // Stable default group colors for the small preview (the viewer manages its
  // own interactive palette).
  const previewColors = useMemo(
    () => (pca?.points ? defaultGroupColors(pca.points) : {}),
    [pca],
  );

  const select = () => onSelect(method.method);

  return (
    <div
      onClick={select}
      className={`flex cursor-pointer flex-col rounded-xl border-2 p-3 shadow-sm transition-all ${
        isSelected
          ? "border-primary bg-info-badgeBackground shadow-md ring-2 ring-primary/30"
          : "border-neutral-borderDefault bg-neutral-card hover:border-primary/60 hover:shadow-md"
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wide">
          {method.method}
        </span>
        {isSelected && (
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-text"
          >
            ✓
          </span>
        )}
      </div>

      {/* Density plot (PNG) */}
      <div className="mb-3">
        {density_url ? (
          <img
            src={density_url}
            alt={`${method.method} density`}
            className="w-full cursor-zoom-in rounded-md border bg-neutral-card transition-opacity hover:opacity-80"
            onClick={(e) => {
              e.stopPropagation();
              onDensityClick(density_url, `${method.method.toUpperCase()} – Density plot`);
            }}
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-md border bg-neutral-surface text-xs text-neutral-textDisabled">
            no density plot
          </div>
        )}
        <div className="mt-1 text-center text-[10px] text-neutral-textDisabled">
          Density • click to enlarge
        </div>
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
            className="block w-full overflow-hidden rounded-md border bg-white transition-opacity hover:opacity-80"
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
          <div className="flex h-32 w-full items-center justify-center rounded-md border bg-neutral-surface px-2 text-center text-xs text-neutral-textDisabled">
            {pca?.error ? `PCA: ${pca.error}` : "no PCA data"}
          </div>
        )}
        <div className="mt-1 text-center text-[10px] text-neutral-textDisabled">
          PCA • click to color & export
        </div>
      </div>

      {method.method === "raw" && (
        <div className="mt-3 text-center text-xs text-neutral-textDisabled">
          Raw data (no normalization)
        </div>
      )}

      {/* Explicit select action (mt-auto keeps it pinned to the card bottom). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          select();
        }}
        aria-pressed={isSelected}
        className={`mt-auto w-full rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          isSelected
            ? "bg-primary text-primary-text"
            : "border-2 border-primary text-primary hover:bg-primary hover:text-primary-text"
        }`}
      >
        {isSelected ? "✓ Selected" : "Select"}
      </button>
    </div>
  );
}

export default MethodCard;
