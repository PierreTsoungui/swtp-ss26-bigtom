import { type NavigateFunction, useNavigate, useParams } from "react-router";
import { useJobPolling } from "./hooks/useJobPolling";
import Progressbar from "../../shared/components/Progressbar.tsx";
import { useEffect, useRef } from "react";
import { FilteringStats } from "./components/FilteringStats";
import {useFilterStats} from "./hooks/useFilterStats.ts";
import InfoPanel from "./components/InfoPanel.tsx";
import {JobPhase, type JobStatus, JobStatusValue} from "../../shared/utils/JobTypes.ts";
import CheckIcon from "@mui/icons-material/Check";
import {Alert, AlertTitle} from "@mui/material";

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
    const hasTriggeredFetch = useRef(false);

    // Eigentlich alle nachfolgenden States
    const shouldGetFilterStats = job_id && !hasTriggeredFetch.current &&
        ((jobStatus?.phase === JobPhase.FILTERING && jobStatus?.status === JobStatusValue.COMPLETED) ||
        (jobStatus?.phase === JobPhase.NORMALIZATION_PREVIEW && jobStatus?.status === JobStatusValue.RUNNING));


    const { filterStats, isLoading: filterStatsLoading } = useFilterStats(
        shouldGetFilterStats ? job_id : null
    );

    useEffect(() => {
        if (jobStatus?.phase === JobPhase.NORMALIZATION_PREVIEW && !hasTriggeredFetch.current) {
            hasTriggeredFetch.current = true;
        }
    }, [jobStatus?.phase]);


    const isPreviewReady =
        (jobStatus?.phase === JobPhase.NORMALIZATION_PREVIEW && jobStatus?.status === JobStatusValue.COMPLETED) ||
        (jobStatus?.phase === JobPhase.NORMALIZATION && jobStatus?.status === JobStatusValue.WAITING)


    if (!job_id) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-neutral-background px-6">
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
                <InfoPanel
                    title="Analyse wird vorbereitet"
                    message="Die Analyse wird gerade vorbereitet. Bitte warten..."
                />
            </main>
        );
    }

    if (filterStatsLoading) {
        return (
            <>
                <main className="flex min-h-screen items-center justify-center bg-neutral-background px-6">
                    <InfoPanel
                        title="Filterstatistik vorbereiten"
                        message="Die Filterung ist noch in Bearbeitung. Bitte warten...">
                    </InfoPanel>
                </main>
            </>
        );
    }

    // ── Progressbar anzeigen ──────────────────────────────────────
    const shouldShowProgress =
        (jobStatus?.phase === JobPhase.FILTERING && jobStatus?.status === JobStatusValue.RUNNING) ||
        (jobStatus?.phase === JobPhase.NORMALIZATION_PREVIEW && (
                jobStatus?.status === JobStatusValue.RUNNING || jobStatus?.status === JobStatusValue.COMPLETED
        )) ||
        (jobStatus?.phase === JobPhase.NORMALIZATION && jobStatus?.status === JobStatusValue.WAITING);


    // ── Fehlerfall OHNE Filterstatistiken ─────────────────────────
    if (jobStatus.status === JobStatusValue.FAILED && !filterStats) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-neutral-background px-6">
                <div className="w-full max-w-2xl">
                    <Alert severity="error">
                        <AlertTitle>
                            Analysis failed
                        </AlertTitle>

                        {jobStatus.error?.detail ||
                            jobStatus.current_step ||
                            "An unknown error occurred."}
                    </Alert>
                </div>
            </main>
        );
    }

    // ── Hauptansicht ──────────────────────────────────────────────
    return (
        <main className="flex min-h-screen justify-center bg-neutral-background px-6 py-10">
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
                {jobStatus.status === JobStatusValue.FAILED && filterStats && (
                    <Alert
                        severity="error"
                        sx={{
                            borderRadius: 2,
                            border: "1px solid",
                        }}
                    >
                        <AlertTitle>
                            Normalization preview failed
                        </AlertTitle>

                        {jobStatus.error?.detail ??
                            jobStatus.current_step ??
                            "The preview could not be calculated."}
                    </Alert>
                )}

                {/* Hinweis wenn Vorschau bereit */}
                {isPreviewReady && (
                    <Alert
                        severity="success"
                        icon={<CheckIcon fontSize="inherit" />}
                        className="rounded-lg border border-success bg-success-badgeBackground text-success-badgeText"
                    >
                        <AlertTitle className="font-semibold">
                            Normalization preview successfully calculated
                        </AlertTitle>
                        <span className="text-sm mt-1 block">
                          The preview is ready. You can now switch to the normalization method selection using the Next button.
                        </span>
                    </Alert>
                )}


                {filterStats && (
                    <div data-testid="filtering-stats">
                        <FilteringStats stats={filterStats} />
                    </div>
                )}
            </div>
        </main>
    );
}

