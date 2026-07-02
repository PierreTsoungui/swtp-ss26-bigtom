import React from "react";
import type { BatchRound } from "../utils/types";
import { PlotView, type PlotSource } from "../../../shared/plots";

/**
 * Props for the SvdPlot component.
 */
export interface SvdPlotProps {
    /** Array of correction rounds, each containing a diagnostic heatmap. */
    rounds: BatchRound[];
}


/**
 * Visualizes SVD (Singular Value Decomposition) diagnostic heatmaps for all correction rounds.
 *
 * Each plot is a server-rendered figure (PNG for display, vector PDF for
 * publication) shown through the shared {@link PlotView}, so display, zoom and
 * PNG/PDF export behave exactly like every other static plot in the app.
 * Reading aid: a strong colour in a *technical* row = batch effect; after
 * correction it should fade, while the *biological* row you protected should
 * stay coloured (signal preserved).
 */
export const SvdPlot: React.FC<SvdPlotProps> = ({ rounds }) => {
  if (rounds.length === 0) return <p>No SVD diagnostics available.</p>;

  const titleOf = (r: BatchRound) =>
    `${r.type === "initial" ? "Before correction" : "After correction"} (Round ${r.round})`;

  const sourceOf = (r: BatchRound): PlotSource => ({
    pngUrl: `${r.svd_plot}?format=png`,
    pdfUrl: `${r.svd_plot}?format=pdf`,
    title: `SVD diagnostic — ${titleOf(r)}`,
    downloadName: `svd_plot_round_${r.round}`,
  });

  return (
    <div>
      <h3 className="mb-3 text-lg font-semibold">SVD diagnostic plots</h3>

      <div className="space-y-4">
        {rounds.map((round) => {
          const s = round.settings_used;
          return (
            <div
              key={round.round}
              className={`rounded-xl border p-4 ${
                round.type === "initial"
                  ? "border-neutral-borderDefault bg-neutral-background"
                  : "border-success bg-success-badgeBackground"
              }`}
            >
              <div className="mb-2">
                <h4 className="text-base font-semibold text-neutral-textPrimary">
                  {titleOf(round)}
                </h4>
                {s && (
                  <p className="text-xs text-neutral-textSecondary">
                    Removed: <strong>{s.batch_variable}</strong> · Protected:{" "}
                    {s.covariates.length > 0 ? s.covariates.join(", ") : "none"}
                  </p>
                )}
              </div>

              <PlotView source={sourceOf(round)} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
