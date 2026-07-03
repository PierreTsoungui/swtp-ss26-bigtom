import type { FilteringStatsType, FilterStep } from "../utils/types";

/**
 * Prop types for the FilteringStats component
 */
interface FilteringStatsProps {
  stats: FilteringStatsType | null | undefined;
}

// Enforce international English notation standards (e.g., 500,000 instead of 500.000)
const numberFormatter = new Intl.NumberFormat("en-US");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatPercentage(removed: number, total: number): string {
  if (total === 0) return "0.0%";
  const percentage = ((removed / total) * 100).toFixed(1);
  return `${percentage}%`;
}

/**
 * Displays the statistical overview of the probe and sample filtering steps.
 */
export function FilteringStats({ stats }: FilteringStatsProps) {
  if (!stats) {
    return (
        <section
            className="w-full max-w-4xl rounded-lg border border-warning bg-warning-badgeBackground p-6 text-warning-badgeText"
            role="status"
            aria-live="polite"
        >
          <h2 className="text-xl font-semibold">Filtering Statistics Not Available</h2>
          <p className="mt-2 text-sm">
            The received statistical data is empty or invalid.
          </p>
        </section>
    );
  }

  const filterSteps: FilterStep[] = [];

  if (stats.det_p?.enabled) {
    filterSteps.push({
      name: "Detection P-Value",
      label: "Cutoff",
      labelValue: stats.det_p.cutoff,
      removed: stats.det_p.removed,
      after: stats.det_p.after,
    });
  }

  if (stats.bead_count?.enabled) {
    filterSteps.push({
      name: "Bead Count",
      label: "Bead Cutoff",
      labelValue: stats.bead_count.bead_cutoff,
      removed: stats.bead_count.removed,
      after: stats.bead_count.after,
    });
  }

  if (stats.non_cpg?.enabled) {
    filterSteps.push({
      name: "Non-CpG",
      removed: stats.non_cpg.removed,
      after: stats.non_cpg.after,
    });
  }

  if (stats.snp?.enabled) {
    filterSteps.push({
      name: "SNP",
      label: "SNP Cutoff",
      labelValue: stats.snp.maf_cutoff,
      removed: stats.snp.removed,
      after: stats.snp.after,
    });
  }

  if (stats.multi_hit?.enabled) {
    filterSteps.push({
      name: "Multi-Hit",
      removed: stats.multi_hit.removed,
      after: stats.multi_hit.after,
    });
  }

  if (stats.xy_chromosomes?.enabled) {
    filterSteps.push({
      name: "XY Chromosomes",
      removed: stats.xy_chromosomes.removed,
      after: stats.xy_chromosomes.after,
    });
  }

  const hasSampleQuality = stats.sample_quality?.enabled;

  return (
      <section
          className="w-full max-w-4xl rounded-lg border border-neutral-borderDefault bg-neutral-card p-6 shadow-sm"
          aria-labelledby="filtering-stats-title"
      >
        <div className="mb-6">
          <h2 id="filtering-stats-title" className="text-2xl font-semibold text-neutral-textPrimary">
            Filtering Statistics
          </h2>
          <p className="mt-1 text-sm text-neutral-textSecondary">
            Overview of the applied filtering steps and their impact on the dataset.
          </p>
        </div>

        {/* Top Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-neutral-borderDefault bg-neutral-background px-4 py-3">
            <p className="text-xs font-medium text-neutral-textSecondary">Probes Start</p>
            <p className="mt-2 text-2xl font-semibold text-neutral-textPrimary">
              {formatNumber(stats.total_start)}
            </p>
          </div>

          <div className="rounded-md border border-warning bg-warning-badgeBackground px-4 py-3">
            <p className="text-xs font-medium text-warning-badgeText">Total Removed</p>
            <p className="mt-2 text-2xl font-semibold text-warning-badgeText">
              {formatNumber(stats.total_removed)}
            </p>
            <p className="mt-1 text-xs text-warning-badgeText">
              ({formatPercentage(stats.total_removed, stats.total_start)})
            </p>
          </div>

          <div className="rounded-md border border-success bg-success-badgeBackground px-4 py-3">
            <p className="text-xs font-medium text-success-badgeText">Probes End</p>
            <p className="mt-2 text-2xl font-semibold text-success-badgeText">
              {formatNumber(stats.total_end)}
            </p>
          </div>
        </div>

        {/* Probe Filters Table */}
        {filterSteps.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-neutral-textSecondary">Probe Filters</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Probe filters with removed and remaining counts
                  </caption>
                  <thead>
                  <tr className="border-b border-neutral-borderDefault bg-neutral-background text-neutral-textSecondary">
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Filter
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold hidden sm:table-cell">
                      Probes Before
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Removed
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Remaining
                    </th>
                  </tr>
                  </thead>
                  <tbody>
                  {filterSteps.map((step : FilterStep) => (
                      <tr
                          key={step.name}
                          className="border-b border-neutral-surface last:border-b-0 hover:bg-neutral-background"
                      >
                        <th scope="row" className="px-4 py-3 font-medium text-neutral-textPrimary">
                          {step.name}
                          {step.labelValue !== undefined && step.labelValue !== null && (
                            <span className="ml-2 text-xs font-normal text-neutral-textSecondary">
                              ({step.label}: {step.labelValue})
                            </span>
                          )}
                        </th>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-textSecondary hidden sm:table-cell">
                          {formatNumber(stats.total_start)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-warning">
                          {formatNumber(step.removed)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-textSecondary">
                          {formatNumber(step.after)}
                        </td>
                      </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            </div>
        )}

        {/* Sample Quality Section */}
        {hasSampleQuality && (
            <div className="rounded-md border border-info bg-info-badgeBackground p-4">
              <h3 className="font-semibold text-info-badgeText">Sample Quality Filter</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-info-badgeText">Detection P Cutoff</p>
                  <p className="mt-1 text-sm font-medium text-info-badgeText">
                    {stats.sample_quality.detection_p_cutoff}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-info-badgeText">Sample Failure Rate</p>
                  <p className="mt-1 text-sm font-medium text-info-badgeText">
                    {(stats.sample_quality.sample_failure_rate * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-info-badgeText">Samples Before</p>
                  <p className="mt-1 text-sm font-medium text-info-badgeText">
                    {stats.sample_quality.samples_before}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-info-badgeText">Samples Removed</p>
                  <p className="mt-1 text-sm font-medium text-info-badgeText">
                    {stats.sample_quality.samples_removed}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-info-badgeText">Samples After</p>
                  <p className="mt-1 text-sm font-medium text-info-badgeText">
                    {stats.sample_quality.samples_after}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-info-badgeText">PCA Outlier Detection</p>
                  <p className="mt-1 text-sm font-medium text-info-badgeText">
                    {stats.sample_quality.enable_pca_outlier_detection ? "✓ Active" : "○ Inactive"}
                  </p>
                </div>
              </div>
            </div>
        )}
      </section>
  );
}
