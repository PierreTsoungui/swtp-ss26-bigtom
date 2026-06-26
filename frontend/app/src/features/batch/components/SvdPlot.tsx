import React, { useState } from "react";
import type { BatchRound } from "../utils/types";

export interface SvdPlotProps {
  rounds: BatchRound[];
}

/**
 * Static SVD diagnostic heatmaps across all correction rounds.
 *
 * Each plot is a server-rendered figure (PNG for display, vector PDF for
 * publication). Reading aid: a strong colour in a *technical* row = batch
 * effect; after correction it should fade, while the *biological* row you
 * protected should stay coloured (signal preserved).
 */
export const SvdPlot: React.FC<SvdPlotProps> = ({ rounds }) => {
  const [enlarged, setEnlarged] = useState<BatchRound | null>(null);

  if (rounds.length === 0) return <p>No SVD diagnostics available.</p>;

  const titleOf = (r: BatchRound) =>
    `${r.type === "initial" ? "Before correction" : "After correction"} (Round ${r.round})`;

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
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
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
                <a
                  href={`${round.svd_plot}?format=pdf`}
                  className="rounded-lg border-2 border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-text"
                >
                  Download PDF
                </a>
              </div>

              <button
                type="button"
                onClick={() => setEnlarged(round)}
                className="block w-full cursor-zoom-in overflow-x-auto rounded-md border border-neutral-borderDefault bg-white p-2"
                aria-label={`Enlarge ${titleOf(round)}`}
              >
                <img
                  src={round.svd_plot}
                  alt={titleOf(round)}
                  className="mx-auto block h-auto max-w-full"
                />
              </button>
            </div>
          );
        })}
      </div>

      {/* Enlarge overlay */}
      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-textPrimary/70 p-4 backdrop-blur-sm"
          onClick={() => setEnlarged(null)}
        >
          <div
            className="relative max-h-[92vh] max-w-[95vw] overflow-auto rounded-xl bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setEnlarged(null)}
              aria-label="Close"
              className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-surface text-lg font-bold hover:bg-neutral-borderDefault"
            >
              ✕
            </button>
            <img src={enlarged.svd_plot} alt={titleOf(enlarged)} className="block h-auto" />
          </div>
        </div>
      )}
    </div>
  );
};
