import {type NavigateFunction, useNavigate, useParams} from "react-router";
import { FilteringStats } from "./components/FilteringStats";
import { ResultsTable } from "./components/ResultsTable";
import { useFilteringStats } from "./hooks/useFilteringStats";
import { useJobPolling } from "./hooks/useJobPolling";
import { useResultsTable } from "./hooks/useResultsTable";
import type {FilteringStatsStatus, JobStatus, JobStatusValue} from "./utils/types";
import Progressbar from "./components/Progressbar.tsx";
import {useEffect} from "react";

/**
 * Hauptseite für die Analyse eines Jobs. Zeigt abhängig vom Status des Jobs entweder einen Fortschrittsbalken,
 * eine Fehlermeldung oder die Filterstatistiken an.
 * @returns Die gerenderte Analyse-Seite
 */
export function AnalysisPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const jobStatus : JobStatus | null = useJobPolling(job_id ?? null);
  const filteringStatus = mapJobStatusToFilteringStatsStatus(jobStatus?.status);
  const filteringStats = useFilteringStats(job_id ?? null, filteringStatus);
  const resultsTable = useResultsTable(job_id ?? null, jobStatus?.status);
  const navigate : NavigateFunction = useNavigate();


  useEffect(() => {
    if (!jobStatus) return;

    // Spezialfall: Normalisierungsvorschau bereit
    if (jobStatus.status === "waiting" && jobStatus.phase === "waiting_selection") {
      navigate(`/normalization/${job_id}`);
    }

    // Pipeline komplett abgeschlossen
    /*if (jobStatus.status === "completed") {
      navigate(`/results/${job_id}`);
    }*/

  }, [jobStatus?.status, jobStatus?.phase]);

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

  if (!jobStatus) {
    return (
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-slate-500">Verbindung wird aufgebaut...</p>
        </main>
    );
  }

  if (filteringStatus === "filtering" || filteringStatus === "idle") {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <Progressbar jobStatus={jobStatus} />
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
    if (!jobStatus) {
      return (
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-slate-500">Verbindung wird aufgebaut...</p>
        </main>
      );
    }
    else {
      return (
          <main className="flex min-h-screen items-center justify-center">
            <p className="text-slate-500">Lade Filterstatistiken...</p>
          </main>
      );
    }
  }

  if (jobStatus?.status === "normalization_done") {
    if (resultsTable.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <section
            className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm"
            role="alert"
          >
            <h1 className="text-2xl font-semibold">
              Ergebnistabelle konnte nicht geladen werden
            </h1>
            <p className="mt-3">{resultsTable.error}</p>
          </section>
        </main>
      );
    }

    if (resultsTable.isLoading || !resultsTable.data) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <section
            className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm"
            aria-live="polite"
            aria-busy="true"
          >
            <h1 className="text-2xl font-semibold text-slate-900">
              Ergebnistabelle wird geladen
            </h1>
            <p className="mt-3 text-slate-600">
              Die normalisierten Analyseergebnisse werden abgerufen.
            </p>
          </section>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
        <ResultsTable
          data={resultsTable.data}
          sorting={resultsTable.sorting}
          onSortingChange={resultsTable.setSorting}
        />
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

