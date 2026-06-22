import {
    Accordion,
    AccordionDetails,
    AccordionSummary,
    Button,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography,
} from "@mui/material";
import {ArrowDropDown, ZoomIn} from "@mui/icons-material";
import {useEffect, useState} from "react";
import { useParams } from "react-router-dom";

import { useJobPolling } from "../../../analysis/hooks/useJobPolling.ts";

import {useHeatMapOptions} from "../../hooks/useHeatMapOptions.ts";
import {useGenerateHeatMap} from "../../hooks/useGenerateHeatMap.ts";
import Progressbar from "../../../../shared/components/Progressbar.tsx";
import ErrorMessage from "../../../../shared/error-handling/components/ErrorMessage.tsx";
import downloadHeatmap from "../../utils/downloadHeatmap.ts";
import type {HeatmapDmpFilter} from "../../utils/types.ts";
import {JobPhase, type JobStatus, JobStatusValue} from "../../../../shared/utils/JobTypes.ts";
import type {ProblemDetail} from "../../../../shared/error-handling/types/ErrorTypes.ts";


type HeatMapProps = {
    dmp_filter: HeatmapDmpFilter;
}

/**
 * Hauptkomponente für die Heatmap Funktionalität. Ermöglicht die Auswahl von Gruppierungsspalten und das Generieren der Heatmap.
 *
 * @note Diese Komponente wird nur als aufklappbares Accordion dargestellt,
 * welches in der DMP-Ansicht eingebettet ist. Sie ist nicht als eigenständige Seite gedacht.
 * @constructor
 */
function HeatMap({ dmp_filter }: HeatMapProps) {
    const { job_id } = useParams<{ job_id: string }>();
    console.log("HeatMap Component - job_id:", job_id);
    const [isExpanded, setIsExpanded] = useState(false);

    const [primaryGrouping, setPrimaryGrouping] = useState("");
    const [secondaryGrouping, setSecondaryGrouping] = useState("");

    // const jobStatus: JobStatus | null = useJobPolling(job_id ?? null);
    const [isHeatmapPolling, setIsHeatmapPolling] = useState(false);
    const [pollingKey, setPollingKey] = useState(0);

    const jobStatus: JobStatus | null = useJobPolling(
        isHeatmapPolling ? (job_id ?? null) : null,
        pollingKey
    );
    const [heatmapImageURL, setHeatmapImageURL] = useState<string | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);

    const [persistentError, setPersistentError] = useState<ProblemDetail | Error | string | null>(null);

    const {
        data: options,
        isLoading: optionsLoading,
    } = useHeatMapOptions(job_id ?? null);

    const {
        data: heatmapResponse,
        isLoading: isGenerating,
        error,
        generateHeatMap,
    } = useGenerateHeatMap(job_id ?? null);

    const backendHeatmapError = (jobStatus?.phase === JobPhase.HEATMAP && jobStatus?.status === JobStatusValue.FAILED) ? jobStatus.error : null;

    const [showError, setShowError] = useState(false);

    console.log("backendHeatmapError", backendHeatmapError);
    console.log("jobStatus.error", jobStatus?.error);

    console.log("HeatMap Response: ", heatmapResponse);
    console.log("[HeatMap] optionsLoading:", optionsLoading);
    console.log("[HeatMap] options data:", options);
    console.log("[HeatMap] availableColumns:", options?.available_columns);

    const availableColumns = options?.available_columns ?? [];
    console.log("HeatMap Component - availableColumns:", availableColumns);

    const secondaryOptions = availableColumns.filter(
        (column) => column !== primaryGrouping,
    );

    useEffect(() => {
        if (jobStatus?.status === JobStatusValue.FAILED && jobStatus.error) {
            setPersistentError(jobStatus.error);
        }
    }, [jobStatus]);

    useEffect(() => {
        if (error || persistentError || backendHeatmapError) {
            setShowError(true);
        }
    }, [error, persistentError, backendHeatmapError]);

    const displayedError = error ?? persistentError ?? backendHeatmapError ?? null;

    const handleGenerate = async () => {
        if (!primaryGrouping) {
            return;
        }
        setHeatmapImageURL(null); // Vorherige Heatmap zurücksetzen
        setPersistentError(null);
        setShowError(false);
        setPollingKey((prev => prev + 1)); // Trigger Job Status Polling
        setIsHeatmapPolling(true);

        await generateHeatMap({
            dmp_filter: {
                dmr_id: dmp_filter.dmr_id,
                chromosome: dmp_filter.chromosome,
                start: dmp_filter.start
                    ? Number(dmp_filter.start)
                    : undefined,
                stop: dmp_filter.stop
                    ? Number(dmp_filter.stop)
                    : undefined,
                p_value_max: dmp_filter.p_value_max,
                adj_p_value_max: dmp_filter.adj_p_value_max,
                delta_beta_min: dmp_filter.delta_beta_min,
                delta_beta_max: dmp_filter.delta_beta_max,
            },
            grouping: {
                primary: primaryGrouping,
                secondary: secondaryGrouping || undefined,
            },
        });
    };

    useEffect(() => {
        if (!jobStatus) return;
        console.log("[HeatMap Polling]", jobStatus.status, jobStatus.phase);
        // TODO: Prüfen, könnte falsch sein, dass man bei RESULTS + WAITING fertig ist (eig nicht)
        const isDone =
            (jobStatus.status == JobStatusValue.COMPLETED && jobStatus.phase == JobPhase.HEATMAP) ||
            (jobStatus.status == JobStatusValue.WAITING && jobStatus.phase == JobPhase.RESULTS) ;

        const isFailed = jobStatus.phase === JobPhase.HEATMAP && jobStatus.status === JobStatusValue.FAILED;

        if (isDone) {
            setIsHeatmapPolling(false);
            setHeatmapImageURL(
                `/api/v1/heatmap/${job_id}?t=${Date.now()}`
            );
        }

        if (isFailed) {
            setIsHeatmapPolling(false);
        }
    }, [jobStatus?.status, jobStatus?.phase]);

    console.log("[HeatMap] Rendering Select, availableColumns:", availableColumns);
    return (
        <Accordion
            expanded={isExpanded}
            onChange={() => setIsExpanded(!isExpanded)}
        >
            <AccordionSummary expandIcon={<ArrowDropDown />}>
                <Typography variant="h6">
                    Heatmap
                </Typography>
            </AccordionSummary>

            <AccordionDetails>
                <div className="space-y-6">

                    {/* Dropdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* Hauptsortierung */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold">
                                Hauptsortierung{" "}
                                <span className="text-red-500">*</span>
                            </label>

                            <FormControl
                                fullWidth
                                disabled={optionsLoading || isGenerating}
                            >
                                <InputLabel id="primary-grouping-label">
                                    Bitte auswählen...
                                </InputLabel>

                                <Select
                                    labelId="primary-grouping-label"
                                    value={primaryGrouping}
                                    label="Bitte auswählen..."
                                    onChange={(e) =>
                                        setPrimaryGrouping(
                                            e.target.value,
                                        )
                                    }
                                >
                                    {availableColumns.map((column) => (
                                        <MenuItem
                                            key={column}
                                            value={column}
                                        >
                                            {column}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </div>

                        {/* Untersortierung */}
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold">
                                Untersortierung (optional)
                            </label>

                            <FormControl
                                fullWidth
                                disabled={optionsLoading || isGenerating}
                            >
                                <InputLabel id="secondary-grouping-label">
                                    Keine Auswahl
                                </InputLabel>

                                <Select
                                    labelId="secondary-grouping-label"
                                    value={secondaryGrouping}
                                    label="Keine Auswahl"
                                    onChange={(e) =>
                                        setSecondaryGrouping(
                                            e.target.value,
                                        )
                                    }
                                >
                                    <MenuItem value="">
                                        Keine Auswahl
                                    </MenuItem>

                                    {secondaryOptions.map((column) => (
                                        <MenuItem
                                            key={column}
                                            value={column}
                                        >
                                            {column}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </div>
                    </div>

                    {/* Generate Button */}
                    <div>
                        <Button
                            variant="contained"
                            disabled={
                                !primaryGrouping ||
                                isGenerating
                            }
                            onClick={handleGenerate}
                        >
                            Generate Heatmap
                        </Button>
                    </div>

                    {/* Progress */}
                    {(isHeatmapPolling || isGenerating) && (
                        <div className="mt-4">
                            {jobStatus
                                ? <Progressbar jobStatus={jobStatus} />
                                : <p className="text-slate-500 text-sm">Heatmap wird gestartet...</p>
                            }
                        </div>
                    )}

                    {/* Error */}
                    {displayedError && (
                        <ErrorMessage open={showError} error={displayedError} vertical="top" horizontal="center" onClose={() => setShowError(false)}/>
                    )}


                    {/* Heatmap Anzeige */}
                    {heatmapImageURL && (
                        <div className="space-y-4">
                            <div
                                className="border rounded-lg overflow-hidden bg-slate-50
                       cursor-pointer hover:opacity-90 transition-opacity relative group"
                                onClick={() => setIsModalOpen(true)}
                            >
                                <img
                                    src={heatmapImageURL}   // ← korrekte URL aus State
                                    alt="Heatmap Vorschau"
                                    className="w-full object-contain max-h-64"
                                />
                                <div className="absolute inset-0 flex items-center justify-center
                            bg-black/0 group-hover:bg-black/20 transition-colors">
                <span className="opacity-0 group-hover:opacity-100
                                 bg-white rounded-full px-4 py-2 text-sm
                                 font-medium shadow-lg transition-opacity">
                    🔍 Vergrößern
                </span>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end">
                                <Button variant="outlined" startIcon={<ZoomIn />}
                                        onClick={() => setIsModalOpen(true)}>
                                    Vergrößern
                                </Button>
                                <Button variant="outlined"
                                        onClick={() => downloadHeatmap(job_id ?? "")}>
                                    ⬇ Als PNG exportieren
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Modal */}
                    {isModalOpen && heatmapImageURL && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center
                    bg-black/70 backdrop-blur-sm p-4"
                             onClick={() => setIsModalOpen(false)}>
                            <div className="relative bg-white rounded-xl shadow-2xl
                        max-w-[90vw] max-h-[90vh] overflow-auto p-4"
                                 onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => setIsModalOpen(false)}
                                        className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full
                               bg-slate-100 hover:bg-slate-200 flex items-center
                               justify-center font-bold text-slate-600">
                                    ✕
                                </button>
                                <img src={heatmapImageURL}
                                     alt="Heatmap"
                                     className="max-w-full max-h-[80vh] object-contain" />
                                <div className="flex justify-end mt-3">
                                    <Button variant="outlined"
                                            onClick={() => downloadHeatmap(job_id ?? "")}>
                                        ⬇ Als PNG exportieren
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </AccordionDetails>
        </Accordion>
    );
}

export default HeatMap;