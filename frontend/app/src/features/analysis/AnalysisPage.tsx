import { useParams } from "react-router";
import { FilteringStats } from "./components/FilteringStats";
import { useFilteringStats } from "./hooks/useFilteringStats";
import { useJobPolling } from "./hooks/useJobPolling";
import type { FilteringStatsStatus, JobStatusValue } from "./utils/types";

export function AnalysisPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const jobStatus = useJobPolling(job_id ?? null);
  const filteringStatus = mapJobStatusToFilteringStatsStatus(jobStatus?.status);
  const filteringStats = useFilteringStats(job_id ?? null, filteringStatus);

  if (!job_id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <InfoPanel
          title="Analyse nicht verfügbar"
          message="Für diese Analyse wurde keine Job-ID übergeben."
        />
      </main>
    );
  }

  if (filteringStatus === "filtering") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section
          className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
            Analyse
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            Filterung läuft
          </h1>
          <p className="mt-3 text-slate-600">
            Die Filterstatistiken werden angezeigt, sobald die Filterung abgeschlossen ist.
          </p>
        </section>
      </main>
    );
  }

  if (filteringStats.error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section
          className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm"
          role="alert"
        >
          <h1 className="text-2xl font-semibold">Filterstatistik konnte nicht geladen werden</h1>
          <p className="mt-3">{filteringStats.error}</p>
        </section>
      </main>
    );
  }

  if (filteringStats.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section
          className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm"
          aria-live="polite"
          aria-busy="true"
        >
          <h1 className="text-2xl font-semibold text-slate-900">
            Filterstatistik wird geladen
          </h1>
          <p className="mt-3 text-slate-600">
            Die abgeschlossenen Filterschritte werden abgerufen.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
      {filteringStatus === "filtering_done" && filteringStats.data ? (
        <FilteringStats stats={filteringStats.data} />
      ) : (
        <InfoPanel
          title="Analyse"
          message="Keine Filterstatistiken für diesen Job verfügbar."
        />
      )}
    </main>
  );
}

interface InfoPanelProps {
  title: string;
  message: string;
}

function InfoPanel({ title, message }: InfoPanelProps) {
  return (
    <section
      className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
      aria-labelledby="analysis-title"
    >
      <h1 id="analysis-title" className="text-2xl font-semibold text-slate-900">
        {title}
      </h1>
      <p className="mt-3 text-slate-600">{message}</p>
    </section>
  );
}

function mapJobStatusToFilteringStatsStatus(
  status: JobStatusValue | undefined
): FilteringStatsStatus {
  if (status === "filtering" || status === "filtering_done") {
    return status;
  }

  if (status === "failed" || status === "canceled") {
    return "error";
  }

  return "idle";
}
