import type { FilteringStats as FilteringStatsData } from "../utils/types";

interface FilteringStatsProps {
  stats: FilteringStatsData;
}

interface StatItem {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "success";
}

const numberFormatter = new Intl.NumberFormat("de-DE");

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function FilteringStats({ stats }: FilteringStatsProps) {
  const removedTotal = stats.removedLowQuality + stats.removedFailedSamples;
  const removedPercentage =
    stats.totalProbes > 0 ? (removedTotal / stats.totalProbes) * 100 : 0;

  const items: StatItem[] = [
    {
      label: "Gesamte Sonden",
      value: stats.totalProbes,
      tone: "neutral",
    },
    {
      label: "Entfernt wegen niedriger Qualität",
      value: stats.removedLowQuality,
      tone: "warning",
    },
    {
      label: "Entfernt wegen fehlgeschlagener Samples",
      value: stats.removedFailedSamples,
      tone: "warning",
    },
    {
      label: "Verbleibende Sonden",
      value: stats.remaining,
      tone: "success",
    },
  ];

  return (
    <section
      className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="filtering-stats-title"
    >
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="filtering-stats-title" className="text-2xl font-semibold text-slate-900">
            Filterstatistik
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Zusammenfassung der nach der Filterung entfernten und verbleibenden Sonden.
          </p>
        </div>
        <p className="text-sm font-medium text-slate-700">
          Entfernt gesamt: {formatNumber(removedTotal)} ({formatPercentage(removedPercentage)})
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-md border border-slate-200 bg-slate-50 p-4"
          >
            <dt className="text-sm font-medium text-slate-600">{item.label}</dt>
            <dd className={`mt-2 text-3xl font-semibold ${getValueClassName(item.tone)}`}>
              {formatNumber(item.value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function getValueClassName(tone: StatItem["tone"]): string {
  switch (tone) {
    case "success":
      return "text-emerald-700";
    case "warning":
      return "text-amber-700";
    case "neutral":
      return "text-slate-900";
  }
}

function formatPercentage(value: number): string {
  return `${value.toFixed(1)} %`;
}
