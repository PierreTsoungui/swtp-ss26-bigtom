import { type NavigateFunction, useNavigate, useParams } from "react-router";
// import { ResultsTable } from "./components/ResultsTable";
import { useJobPolling } from "./hooks/useJobPolling";
// import { useResultsTable } from "./hooks/useResultsTable";
import type { FilteringStatsType, JobStatus } from "./utils/types";
import Progressbar from "./components/Progressbar.tsx";
import { useEffect, useRef } from "react";
import { FilteringStats } from "./components/FilteringStats";

/**
 * Hauptseite für die Analyse eines Jobs.
 * Zeigt abhängig vom Status:
 * - Fortschrittsbalken
 * - Filterstatistiken
 * - Fehlerhinweise
 * - Navigation zur Normalisierungsvorschau
 */
export function AnalysisPage() {
    const { job_id } = useParams<{ job_id: string }>();
    const jobStatus: JobStatus | null = useJobPolling(job_id ?? null);
    const navigate: NavigateFunction = useNavigate();

    // ── Filter Stats cachen ───────────────────────────────────────
    // Stats bleiben sichtbar, auch wenn spätere Phasen keine
    // filter_stats mehr mitsenden.
    const cachedFilterStats = useRef<FilteringStatsType | null>(null);

    useEffect(() => {
        console.log("Filter Stats Cache Update:", jobStatus?.filter_stats);

        if (jobStatus?.filter_stats) {
            cachedFilterStats.current = jobStatus.filter_stats;
        }
    }, [jobStatus]);

    const isPreviewReady =
        jobStatus?.status === "waiting" &&
        jobStatus?.phase === "waiting_selection";

    useEffect(() => {
        if (!jobStatus || !job_id) return;

        // KEIN automatisches navigate mehr.
        // Navigation erfolgt manuell über den Weiter-Button.

        // Pipeline komplett abgeschlossen
        /*
        if (jobStatus.status === "completed") {
          navigate(`/results/${job_id}`);
        }
        */
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

    // ── Progressbar anzeigen ──────────────────────────────────────
    const shouldShowProgress =
        jobStatus.status === "queued" ||
        jobStatus.status === "running" ||
        (jobStatus.status === "waiting" &&
            jobStatus.phase === "waiting_selection");

    // ── Fehlerfall OHNE Filterstatistiken ─────────────────────────
    if (jobStatus.status === "failed" && !cachedFilterStats.current) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
                <section
                    className="w-full max-w-2xl rounded-lg border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm"
                    role="alert"
                >
                    <h1 className="text-2xl font-semibold">
                        Analyse fehlgeschlagen
                    </h1>

                    <p className="mt-3">
                        {jobStatus.error?.detail ||
                            jobStatus.current_step ||
                            "Ein unbekannter Fehler ist aufgetreten."}
                    </p>
                </section>
            </main>
        );
    }

    // ── Hauptansicht ──────────────────────────────────────────────
    return (
        <main className="flex min-h-screen justify-center bg-slate-50 px-6 py-10">
            <div className="w-full max-w-4xl space-y-6">

                {/* Progressbar */}
                {shouldShowProgress && (
                    <div data-testid="preview-progress">
                        <Progressbar
                            jobStatus={jobStatus}
                            showNextButton={true}
                            nextDisabled={!isPreviewReady}
                            onNext={() => navigate(`/normalization/${job_id}`)}
                        />
                    </div>
                )}

                {/* Fehlerbanner */}
                {jobStatus.status === "failed" && cachedFilterStats.current && (
                    <section
                        className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900"
                        role="alert"
                    >
                        <p className="font-semibold">
                            Normalisierungsvorschau fehlgeschlagen
                        </p>

                        <p className="text-sm mt-1">
                            {jobStatus.error?.detail ??
                                jobStatus.current_step ??
                                "Die Vorschau konnte nicht berechnet werden."}
                        </p>
                    </section>
                )}

                {/* Hinweis wenn Vorschau bereit */}
                {isPreviewReady && (
                    <section
                        className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900"
                        aria-live="polite"
                    >
                        <p className="font-semibold">
                            Normalisierungsvorschau erfolgreich berechnet
                        </p>

                        <p className="text-sm mt-1">
                            Die Vorschau ist bereit. Über den Weiter-Button kann nun zur
                            Auswahl der Normalisierungsmethode gewechselt werden.
                        </p>
                    </section>
                )}

                {/* Filterstatistiken */}
                {cachedFilterStats.current ? (
                    <div data-testid="filtering-stats">
                        <FilteringStats stats={cachedFilterStats.current} />
                    </div>
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
            <h1
                id="analysis-title"
                className="text-2xl font-semibold text-slate-900"
            >
                {title}
            </h1>

            <p className="mt-3 text-slate-600">
                {message}
            </p>
        </section>
    );
}