import {type NavigateFunction, useNavigate, useParams} from "react-router";
import { ResultsTable } from "./components/ResultsTable";
import { useJobPolling } from "./hooks/useJobPolling";
import { useResultsTable } from "./hooks/useResultsTable";
import type {FilteringStatsType,  JobStatus} from "./utils/types";
import Progressbar from "./components/Progressbar.tsx";
import {useEffect, useRef} from "react";
import {FilteringStats} from "./components/FilteringStats";
import CircularProgress from '@mui/material/CircularProgress';
import {convertBackendFilterStats} from "./utils/helpers.ts";

/**
 * Hauptseite für die Analyse eines Jobs. Zeigt abhängig vom Status des Jobs entweder einen Fortschrittsbalken,
 * eine Fehlermeldung oder die Filterstatistiken an.
 * @returns Die gerenderte Analyse-Seite
 */
export function AnalysisPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const jobStatus : JobStatus | null = useJobPolling(job_id ?? null);
  const resultsTable = useResultsTable(job_id ?? null, jobStatus?.status);
  const navigate : NavigateFunction = useNavigate();

  // ── Filter Stats cachen ───────────────────────────────────────
  // Sobald filter_stats einmal nicht null sind, speichern wir sie.
  // Sie bleiben sichtbar auch wenn die Phase weiterwechselt.
  const cachedFilterStats = useRef<FilteringStatsType | null>(null);
  if (jobStatus?.filter_stats && !cachedFilterStats.current) {
    cachedFilterStats.current = convertBackendFilterStats(jobStatus.filter_stats);
  }

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
  // Filterstatistik anzeigen!
  if ((jobStatus.status === "running" && jobStatus.phase === "filtering") || jobStatus.status === "queued") {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <Progressbar jobStatus={jobStatus} />
        </main>
    );
  }

  if (jobStatus.status === "failed") {
    // Wenn wir bereits Filterstatistiken haben → weiter anzeigen
    // statt den Fehlerscreen zu zeigen, damit der Nutzer die letzten verfügbaren Statistiken sehen kann.
    if (cachedFilterStats.current) {
      return (
          <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
            <div className="w-full max-w-4xl space-y-4">
              {/* Fehlerhinweis als Banner, nicht als Fullscreen */}
              <section
                  className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
                  role="alert"
              >
                <p className="font-semibold">
                  Normalisierungsvorschau fehlgeschlagen
                </p>
                <p className="text-sm mt-1">
                  {jobStatus.error?.detail ??
                      "Die Normalisierungsvorschau konnte nicht berechnet werden. Bitte Backend-Logs prüfen."}
                </p>
              </section>

              {/* Filterstatistik bleibt sichtbar */}
              <FilteringStats stats={cachedFilterStats.current} />
            </div>
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
      <div className="w-full max-w-4xl space-y-4">

        {jobStatus.phase === "normalization_preview"
            && jobStatus.status === "running" && (
                <section
                    className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900"
                    aria-live="polite"
                >
                  <div className="flex items-center gap-3">
                    <CircularProgress aria-label="Loading…" />
                    <div>
                      <p className="font-semibold">
                        Normalisierungsvorschau wird berechnet...
                      </p>
                      <p className="text-sm mt-1">
                        Sie werden automatisch weitergeleitet sobald alle
                        Methoden berechnet wurden.
                      </p>
                    </div>
                  </div>
                </section>
        )}


        { cachedFilterStats.current ? (
          <FilteringStats stats={cachedFilterStats.current} />
        ) : (
          <InfoPanel
            title="Analyse"
            message="Keine Filterstatistiken für diesen Job verfügbar."
          />
        )}
      </div>
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

/*function mapJobStatusToFilteringStatsStatus(
  status: JobStatusValue | undefined
): FilteringStatsStatus {
  if (status === "filtering" || status === "filtering_done") {
    return status;
  }

  if (status === "failed" || status === "canceled") {
    return "error";
  }

  return "idle";
}*/


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

