import type {
  FilteringStatsType as FilteringStatsData,
  FilteringStep,
} from "../utils/types";

interface FilteringStatsProps {
  stats: FilteringStatsData | null | undefined;
}

const numberFormatter = new Intl.NumberFormat("de-DE");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function FilteringStats({ stats }: FilteringStatsProps) {
  if (!isRenderableFilteringStats(stats)) {
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

  return (
    <section
      className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="filtering-stats-title"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="filtering-stats-title" className="text-2xl font-semibold text-slate-900">
            Filterstatistik
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Alle Filterschritte mit entfernten und verbleibenden Sonden.
          </p>
        </div>
        <div
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900"
          aria-label={`Finale Sondenanzahl ${formatNumber(stats.finalProbeCount)}`}
        >
          <p className="text-sm font-medium">Finale Sondenanzahl</p>
          <p className="mt-1 text-3xl font-semibold">
            {formatNumber(stats.finalProbeCount)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            Filterschritte mit Sonden vor dem Schritt, entfernten Sonden und Sonden nach
            dem Schritt
          </caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
              <th scope="col" className="px-4 py-3 font-semibold">
                Filterschritt
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Sonden vorher
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Entfernt
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Sonden nachher
              </th>
            </tr>
          </thead>
          <tbody>
            {stats.steps.map((step, index) => (
              <tr
                key={`${step.name}-${index}`}
                className="border-b border-slate-100 last:border-b-0"
              >
                <th scope="row" className="px-4 py-3 font-medium text-slate-900">
                  {step.name}
                </th>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatNumber(step.probesBefore)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                  {formatNumber(step.removed)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                  {formatNumber(step.probesAfter)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function isRenderableFilteringStats(
  stats: FilteringStatsData | null | undefined
): stats is FilteringStatsData {
  if (!stats || stats.steps.length === 0) return false;

  return stats.steps.every(isRenderableStep) && Number.isFinite(stats.finalProbeCount);
}

function isRenderableStep(step: unknown): step is FilteringStep {
  if (!isRecord(step)) return false;

  return (
    typeof step.name === "string" &&
    step.name.trim().length > 0 &&
    Number.isFinite(step.probesBefore) &&
    Number.isFinite(step.removed) &&
    Number.isFinite(step.probesAfter)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
