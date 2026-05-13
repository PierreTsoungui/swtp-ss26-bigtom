import { useParams /*, useNavigate*/ } from "react-router";
import { FilteringStats } from "./components/FilteringStats";
import { useFilteringStats } from "./hooks/useFilteringStats";
// import ErrorMessage from "../../shared/error-handling/components/ErrorMessage";
// import { useJobPolling } from "./hooks/useJobPolling";
// import type { JobStatus } from "./utils/types";
// import ProgressBar from "./components/Progressbar";

// TODO: Progressbar später mit echter Job-Polling-Logik verbinden.

export function AnalysisPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const filteringStats = useFilteringStats(job_id ?? null);

  /*
  const navigate = useNavigate();
  const jobStatus : JobStatus | null = useJobPolling(job_id ?? null);

  useEffect(() => {
    if (!jobStatus) return;

    // Spezialfall: Normalisierungsvorschau bereit
    if (
      jobStatus.status === "waiting" &&
      jobStatus.phase === "waiting_selection"
    ) {
      navigate(`/normalization/${job_id}`);
    }

    // Pipeline komplett abgeschlossen
    if (jobStatus.status === "completed") {
      navigate(`/results/${job_id}`);
    }
  }, [jobStatus?.status, jobStatus?.phase]);


  // Fehlerfall
  if (jobStatus?.status === "failed" && jobStatus.error) {
    return (
      <ErrorMessage
        open={true}
        vertical="top"
        horizontal="center"
        error={jobStatus.error}
      />
    );
  }

  // Ladescreen
  return (
    <div className="flex justify-center items-center min-h-screen">
      {jobStatus && <ProgressBar jobStatus={jobStatus} />}
    </div>
  );
     */

  if (filteringStats?.status === "filtering") {
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

  return (
    <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
      {filteringStats?.status === "filtering_done" ? (
        <FilteringStats stats={filteringStats.filterStats} />
      ) : (
        <section
          className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
          aria-labelledby="analysis-title"
        >
          <h1 id="analysis-title" className="text-2xl font-semibold text-slate-900">
            Analyse
          </h1>
          <p className="mt-3 text-slate-600">
            Keine Filterstatistiken für diesen Job verfügbar.
          </p>
        </section>
      )}
    </main>
  );
}
