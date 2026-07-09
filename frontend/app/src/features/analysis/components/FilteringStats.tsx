import { type FilteringStatsType } from "../types";
import { buildFilterSteps } from "../utils/filterSteps";

/**
 * Props for the FilteringStats component.
 */
interface FilteringStatsProps {
  /** The audit trail data from the backend. If null, a placeholder is shown. */
  stats: FilteringStatsType | null | undefined;
}

const numberFormatter = new Intl.NumberFormat("en-US");

/** Formats large numbers with thousands separators. */
function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

/** Calculates the percentage of removed items relative to the total. */
function formatPercentage(removed: number, total: number): string {
  if (total === 0) return "0.0%";
  const percentage = ((removed / total) * 100).toFixed(1);
  return `${percentage}%`;
}

/**
 * Displays an audit trail of the data cleaning process.
 *
 * It visualizes the impact of each filtering stage on the probe count and
 * summarizes sample-level quality control results.
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
        <p className="mt-2 text-sm">The received statistical data is empty or invalid.</p>
      </section>
    );
  }

  const filterSteps = buildFilterSteps(stats);
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

      {/* Global Summary Cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-md border border-neutral-borderDefault bg-neutral-background px-4 py-3">
          <p className="text-xs font-medium text-neutral-textSecondary">Probes (Start)</p>
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
              <caption className="sr-only">Probe filters with removed and remaining counts</caption>
              <thead>
                <tr className="border-b border-neutral-borderDefault bg-neutral-background text-neutral-textSecondary">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Filter
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-right font-semibold hidden sm:table-cell"
                  >
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
                {filterSteps.map((step) => (
                  <tr
                    key={step.name}
                    className="border-b border-neutral-surface last:border-b-0 hover:bg-neutral-background"
                  >
                    <th scope="row" className="px-4 py-3 font-medium text-neutral-textPrimary">
                      {step.name}
                      {step.labelValue != null && (
                        <span className="ml-2 text-xs font-normal text-neutral-textSecondary">
                          ({step.label}: {step.labelValue})
                        </span>
                      )}
                    </th>
                    {/* Tabular nums ensuring digits align vertically for easy comparison */}
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-textSecondary hidden sm:table-cell">
                      {formatNumber(stats.total_start)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-warning font-medium">
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

      {/* Sample-Level Quality Metrics */}
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
