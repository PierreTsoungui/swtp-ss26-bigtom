import {type NavigateFunction, useNavigate, useParams} from "react-router";
// import { ResultsTable } from "./components/ResultsTable";
import { useJobPolling } from "./hooks/useJobPolling";
// import { useResultsTable } from "./hooks/useResultsTable";
import type {FilteringStatsType,  JobStatus} from "./utils/types";
import Progressbar from "./components/Progressbar.tsx";
import {useEffect, useRef} from "react";
import {FilteringStats} from "./components/FilteringStats";
import CircularProgress from '@mui/material/CircularProgress';

/**
 * Hauptseite für die Analyse eines Jobs. Zeigt abhängig vom Status des Jobs entweder einen Fortschrittsbalken,
 * eine Fehlermeldung oder die Filterstatistiken an.
 * @returns Die gerenderte Analyse-Seite
 */
export function AnalysisPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const jobStatus : JobStatus | null = useJobPolling(job_id ?? null);
  const navigate : NavigateFunction = useNavigate();
  // const resultsTable = useResultsTable(job_id ?? null, jobStatus?.status);

  // ── Filter Stats cachen ──
  const cachedFilterStats = useRef<FilteringStatsType | null>(null);

  useEffect(() => {
      console.log("Filter Stats Cache Update:", jobStatus?.filter_stats);
    if (jobStatus?.filter_stats) {
        cachedFilterStats.current = jobStatus.filter_stats;
    }
  }, [jobStatus]);


  useEffect(() => {
    if (!jobStatus || !job_id) return;

    // Spezialfall: Normalisierungsvorschau bereit
    if (jobStatus.status === "waiting" && jobStatus.phase === "waiting_selection") {
      navigate(`/normalization/${job_id}`);
    }

    // Pipeline komplett abgeschlossen
    /*if (jobStatus.status === "completed") {
      navigate(`/results/${job_id}`);
    }*/

  }, [jobStatus?.status, jobStatus?.phase, job_id, navigate]);

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

    // -- Filterung läuft --
  if (jobStatus.status === "queued" || (jobStatus.status === "running" && jobStatus.phase === "filtering")) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <Progressbar jobStatus={jobStatus} />
      </main>
    );
  }



  // ── Filterstatistiken anzeigen (nach Filterung, vor Normalisierung) ──
  if (jobStatus.status === "running" && jobStatus.phase === "normalization_preview" && cachedFilterStats.current) {
    return (
        <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
            <div className="w-full max-w-4xl space-y-4">
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

                <FilteringStats stats={cachedFilterStats.current} />
            </div>
        </main>
    );
  }
    // ── NORMALISIERUNG LÄUFT (Progress Bar) ────────────────────────
    /*if (
        jobStatus.status === "running" &&
        (jobStatus.phase === "normalizing" || jobStatus.phase === "batch_correction")
    ) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
                <Progressbar jobStatus={jobStatus} />
            </main>
        );
    }*/


    // ── FEHLERFALL ────────────────────────────────────────────────
    if (jobStatus.status === "failed") {
        console.log("Enter failed: ", jobStatus);
        // Wenn wir gecachte Filterstatistiken haben, zeige diese + Fehler
        if (cachedFilterStats.current) {
            return (
                <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
                    <div className="w-full max-w-4xl space-y-6">
                        {/* Fehlerhinweis */}
                        <section
                            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
                            role="alert"
                        >
                            <p className="font-semibold">Fehler bei der Normalisierung</p>
                            <p className="text-sm mt-1">{jobStatus.current_step}</p>
                        </section>
                        {/* Filterstatistik trotzdem anzeigen */}
                        <FilteringStats stats={cachedFilterStats.current} />
                    </div>
                </main>
            );
        }

        // Fehler ohne Filterstatistiken
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
                <section className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm" role="alert">
                    <h1 className="text-2xl font-semibold">Analyse fehlgeschlagen</h1>
                    <p className="mt-3">{jobStatus.current_step || "Ein unbekannter Fehler ist aufgetreten."}</p>
                </section>
            </main>
        );
    }


    // ── Fallback ──────────────────────────────────────────────────
    return (
        <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
            <InfoPanel
                title="Analyse"
                message={`Status: ${jobStatus.status} | Phase: ${jobStatus.phase}`}
            />
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


