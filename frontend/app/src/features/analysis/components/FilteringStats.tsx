import type { FilteringStatsType } from "../utils/types";

interface FilteringStatsProps {
  stats: FilteringStatsType | null | undefined;
}

interface FilterStep {
  name: string;
  cutoff?: number;
  removed: number;
  after: number;
}

const numberFormatter = new Intl.NumberFormat("de-DE");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatPercentage(removed: number, total: number): string {
  if (total === 0) return "0,0%";
  const percentage = ((removed / total) * 100).toFixed(1);
  return `${percentage.replace(".", ",")}%`;
}

export function FilteringStats({ stats }: FilteringStatsProps) {
  if (!stats) {
    return (
        <section
            className="w-full max-w-4xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900"
            role="status"
            aria-live="polite"
        >
          <h2 className="text-xl font-semibold">Filterstatistik nicht verfügbar</h2>
          <p className="mt-2 text-sm">
            Die empfangenen Statistikdaten sind leer oder fehlerhaft.
          </p>
        </section>
    );
  }

  // Alle Filter in ein typsicheres Array umwandeln (nur aktivierte anzeigen)
  const filterSteps: FilterStep[] = [];

  if (stats.det_p?.enabled) {
    filterSteps.push({
      name: "Detection P-Value",
      cutoff: stats.det_p.cutoff,
      removed: stats.det_p.removed,
      after: stats.det_p.after,
    });
  }

  if (stats.bead_count?.enabled) {
    filterSteps.push({
      name: "Bead Count",
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

  // Sample Quality seperarat behandeln (wenn aktiviert)
  const hasSampleQuality = stats.sample_quality?.enabled;

  return (
      <section
          className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          aria-labelledby="filtering-stats-title"
      >
        <div className="mb-6">
          <h2 id="filtering-stats-title" className="text-2xl font-semibold text-slate-900">
            Filterstatistik
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Übersicht der angewendeten Filterschritte und deren Auswirkungen.
          </p>
        </div>

        {/* Top Stats Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-medium text-slate-600">Sonden Start</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {formatNumber(stats.total_start)}
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium text-amber-700">Entfernt insgesamt</p>
            <p className="mt-2 text-2xl font-semibold text-amber-900">
              {formatNumber(stats.total_removed)}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              ({formatPercentage(stats.total_removed, stats.total_start)})
            </p>
          </div>

          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium text-emerald-700">Sonden Ende</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-900">
              {formatNumber(stats.total_end)}
            </p>
          </div>
        </div>

        {/* Probe Filters Table */}
        {filterSteps.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Sonden-Filter</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Probe-Filter mit entfernten und verbleibenden Sonden
                  </caption>
                  <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                    <th scope="col" className="px-4 py-3 font-semibold">
                      Filter
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold hidden sm:table-cell">
                      Sonden vorher
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Entfernt
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">
                      Verbleibend
                    </th>
                  </tr>
                  </thead>
                  <tbody>
                  {filterSteps.map((step) => (
                      <tr
                          key={step.name}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                          {step.name}
                          {step.cutoff !== undefined && (
                              <span className="ml-2 text-xs font-normal text-slate-600">
                          (Cutoff: {step.cutoff})
                        </span>
                          )}
                        </th>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700 hidden sm:table-cell">
                          {formatNumber(stats.total_start)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                          {formatNumber(step.removed)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
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
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold text-blue-900">Sample Quality Filter</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-blue-700">Detection P Cutoff</p>
                  <p className="mt-1 text-sm font-medium text-blue-900">
                    {stats.sample_quality.detection_p_cutoff}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Sample Failure Rate</p>
                  <p className="mt-1 text-sm font-medium text-blue-900">
                    {(stats.sample_quality.sample_failure_rate * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Samples vorher</p>
                  <p className="mt-1 text-sm font-medium text-blue-900">
                    {stats.sample_quality.samples_before}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Samples entfernt</p>
                  <p className="mt-1 text-sm font-medium text-blue-900">
                    {stats.sample_quality.samples_removed}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">Samples nachher</p>
                  <p className="mt-1 text-sm font-medium text-blue-900">
                    {stats.sample_quality.samples_after}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-blue-700">PCA Outlier Detection</p>
                  <p className="mt-1 text-sm font-medium text-blue-900">
                    {stats.sample_quality.enable_pca_outlier_detection ? "✓ Aktiv" : "○ Inaktiv"}
                  </p>
                </div>
              </div>
            </div>
        )}
      </section>
  );
}