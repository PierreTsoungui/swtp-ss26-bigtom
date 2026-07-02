import { useMemo } from "react";
import type { MethodPreview, NormalizationMethod } from "../utils/types";
import PcaPlot from "./PcaPlot";
import { defaultGroupColors } from "../utils/pcaColors";
import { PlotView, type PlotSource } from "../../../shared/plots";

/**
 * Props of the MethodCard component.
 * @property method      Preview of a method (density URL + PCA data).
 * @property isSelected  Whether this method is selected.
 * @property onSelect    Selection callback.
 * @property onPcaClick      Opens the interactive PCA viewer.
 */
interface MethodCardProps {
  method: MethodPreview;
  isSelected: boolean;
  onSelect: (method: NormalizationMethod) => void;
  onPcaClick: (method: MethodPreview) => void;
}

/**
 * Card for one normalization method.
 *
 * UX: the whole card is clickable to select the method (so a click anywhere –
 * not just a tiny radio – selects it), and an explicit "Select" button at the
 * bottom makes the action unmistakable and keyboard-accessible. The two plots
 * stay independently interactive (enlarge / open the PCA viewer) by stopping
 * click propagation, so they never trigger an accidental selection.
 */
function MethodCard({
  method,
  isSelected,
  onSelect,
  onPcaClick,
}: MethodCardProps) {
  const { density_url, pca } = method;

  // Stable default group colors for the small preview (the viewer manages its
  // own interactive palette).
  const previewColors = useMemo(
    () => (pca?.points ? defaultGroupColors(pca.points) : {}),
    [pca],
  );

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

      {/* Density plot (static PNG/PDF). Clicks must not bubble up and select
          the card, so the whole plot block stops propagation. */}
      <div
        className="mb-3"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {densitySource ? (
          <PlotView
            source={densitySource}
            maxHeightClass="max-h-40"
            exportSize="small"
          />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-md border bg-neutral-surface text-xs text-neutral-textDisabled">
            no density plot
          </div>
        )}
        <div className="mt-1 text-center text-[10px] text-neutral-textDisabled">
          Density
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
