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
import {useParams} from "react-router-dom";

import {useJobPolling} from "../../../analysis/hooks/useJobPolling.ts";
import {useHeatMapOptions} from "../../hooks/useHeatMapOptions.ts";
import {useGenerateHeatMap} from "../../hooks/useGenerateHeatMap.ts";
import Progressbar from "../../../../shared/components/Progressbar.tsx";
import ErrorMessage from "../../../../shared/error-handling/components/ErrorMessage.tsx";
import downloadHeatmap from "../../utils/downloadHeatmap.ts";
import {JobPhase, type JobStatus, JobStatusValue} from "../../../../shared/utils/JobTypes.ts";
import type {ProblemDetail} from "../../../../shared/error-handling/types/ErrorTypes.ts";

/** Hard limit mirrored from the backend (see heatmap-konzept.md §5). */
const MAX_CPGS = 500;

type HeatMapProps = {
    /** The currently applied DMP table filters — forwarded verbatim to the backend. */
    filters: Record<string, string>;
    /** Number of rows the current filter selects (for the pre-check hint). */
    rowCount?: number;
};

/**
 * Heatmap panel embedded in the DMP results view. It reuses the exact filters
 * applied to the table (single filter source) and lets the user pick a primary
 * and optional secondary annotation column. The figure is rendered server-side
 * and downloadable as PNG or PDF.
 */
function HeatMap({filters, rowCount}: HeatMapProps) {
    const {job_id} = useParams<{ job_id: string }>();
    const [isExpanded, setIsExpanded] = useState(false);

    const [primaryGrouping, setPrimaryGrouping] = useState("");
    const [secondaryGrouping, setSecondaryGrouping] = useState("");

    const [isHeatmapPolling, setIsHeatmapPolling] = useState(false);
    const [pollingKey, setPollingKey] = useState(0);

    const jobStatus: JobStatus | null = useJobPolling(
        isHeatmapPolling ? (job_id ?? null) : null,
        pollingKey,
    );

    const [heatmapImageURL, setHeatmapImageURL] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [persistentError, setPersistentError] = useState<ProblemDetail | Error | string | null>(null);
    const [showError, setShowError] = useState(false);

    const {data: options, isLoading: optionsLoading} = useHeatMapOptions(job_id ?? null);
    const {isLoading: isGenerating, error, generateHeatMap} = useGenerateHeatMap(job_id ?? null);

    const backendHeatmapError =
        jobStatus?.phase === JobPhase.HEATMAP && jobStatus?.status === JobStatusValue.FAILED
            ? jobStatus.error
            : null;

    const availableColumns = options?.available_columns ?? [];
    const secondaryOptions = availableColumns.filter((column) => column.name !== primaryGrouping);

    const tooMany = rowCount != null && rowCount > MAX_CPGS;
    const noRows = rowCount != null && rowCount === 0;

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
        if (!primaryGrouping || tooMany || noRows) {
            return;
        }
        setHeatmapImageURL(null);
        setPersistentError(null);
        setShowError(false);
        setPollingKey((prev) => prev + 1);
        setIsHeatmapPolling(true);

        // Forward only the non-empty applied table filters (single filter source).
        const activeFilters = Object.fromEntries(
            Object.entries(filters).filter(([, v]) => v !== "" && v != null),
        );

        await generateHeatMap({
            filters: activeFilters,
            grouping: {
                primary: primaryGrouping,
                secondary: secondaryGrouping || undefined,
            },
        });
    };

    useEffect(() => {
        if (!jobStatus) return;

        const isDone =
            (jobStatus.status === JobStatusValue.COMPLETED && jobStatus.phase === JobPhase.HEATMAP) ||
            (jobStatus.status === JobStatusValue.WAITING && jobStatus.phase === JobPhase.RESULTS);

        const isFailed =
            jobStatus.phase === JobPhase.HEATMAP && jobStatus.status === JobStatusValue.FAILED;

        if (isDone) {
            setIsHeatmapPolling(false);
            setHeatmapImageURL(`/api/v1/heatmap/${job_id}?t=${Date.now()}`);
        }
        if (isFailed) {
            setIsHeatmapPolling(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobStatus?.status, jobStatus?.phase]);

    return (
        <Accordion expanded={isExpanded} onChange={() => setIsExpanded(!isExpanded)}>
            <AccordionSummary expandIcon={<ArrowDropDown/>}>
                <Typography variant="h6">Heatmap</Typography>
            </AccordionSummary>

            <AccordionDetails>
                <div className="space-y-6">
                    {/* Filter selection notice — the heatmap uses the table's current filters */}
                    <p className="text-sm text-slate-500">
                        The heatmap uses the filters currently applied to the DMP table
                        {rowCount != null && <> — <strong>{rowCount}</strong> CpG{rowCount === 1 ? "" : "s"} selected</>}.
                    </p>

                    {/* Row-limit / empty pre-checks */}
                    {tooMany && (
                        <p className="text-sm text-danger">
                            The current filter selects {rowCount} CpGs, which exceeds the limit of {MAX_CPGS}.
                            Please tighten the filter (e.g. adjusted p-value or |Δβ|) before generating the heatmap.
                        </p>
                    )}
                    {noRows && (
                        <p className="text-sm text-danger">
                            No CpGs match the current filter. Please relax the filter criteria.
                        </p>
                    )}

                    {/* Grouping dropdowns */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-semibold">
                                Primary group <span className="text-red-500">*</span>
                            </label>
                            <FormControl fullWidth disabled={optionsLoading || isGenerating}>
                                <InputLabel id="primary-grouping-label">Select a column…</InputLabel>
                                <Select
                                    labelId="primary-grouping-label"
                                    value={primaryGrouping}
                                    label="Select a column…"
                                    onChange={(e) => setPrimaryGrouping(e.target.value)}
                                >
                                    {availableColumns.map((column) => (
                                        <MenuItem key={column.name} value={column.name}>
                                            {column.name}
                                            {column.type !== "categorical" && (
                                                <span className="ml-1 text-xs text-slate-400">({column.type})</span>
                                            )}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-semibold">Secondary group (optional)</label>
                            <FormControl fullWidth disabled={optionsLoading || isGenerating}>
                                <InputLabel id="secondary-grouping-label">None</InputLabel>
                                <Select
                                    labelId="secondary-grouping-label"
                                    value={secondaryGrouping}
                                    label="None"
                                    onChange={(e) => setSecondaryGrouping(e.target.value)}
                                >
                                    <MenuItem value="">None</MenuItem>
                                    {secondaryOptions.map((column) => (
                                        <MenuItem key={column.name} value={column.name}>
                                            {column.name}
                                            {column.type !== "categorical" && (
                                                <span className="ml-1 text-xs text-slate-400">({column.type})</span>
                                            )}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </div>
                    </div>

                    {/* Generate */}
                    <div>
                        <Button
                            variant="contained"
                            disabled={!primaryGrouping || isGenerating || tooMany || noRows}
                            onClick={handleGenerate}
                        >
                            Generate Heatmap
                        </Button>
                    </div>

                    {/* Progress */}
                    {(isHeatmapPolling || isGenerating) && (
                        <div className="mt-4">
                            {jobStatus ? (
                                <Progressbar jobStatus={jobStatus}/>
                            ) : (
                                <p className="text-slate-500 text-sm">Starting heatmap…</p>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {displayedError && (
                        <ErrorMessage
                            open={showError}
                            error={displayedError}
                            vertical="top"
                            horizontal="center"
                            onClose={() => setShowError(false)}
                        />
                    )}

                    {/* Result */}
                    {heatmapImageURL && (
                        <div className="space-y-4">
                            <div
                                className="border rounded-lg overflow-hidden bg-slate-50 cursor-pointer hover:opacity-90 transition-opacity relative group"
                                onClick={() => setIsModalOpen(true)}
                            >
                                <img
                                    src={heatmapImageURL}
                                    alt="Heatmap preview"
                                    className="w-full object-contain max-h-64"
                                />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                                    <span className="opacity-0 group-hover:opacity-100 bg-white rounded-full px-4 py-2 text-sm font-medium shadow-lg transition-opacity">
                                        🔍 Enlarge
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end">
                                <Button variant="outlined" startIcon={<ZoomIn/>} onClick={() => setIsModalOpen(true)}>
                                    Enlarge
                                </Button>
                                <Button variant="outlined" onClick={() => downloadHeatmap(job_id ?? "", "png")}>
                                    ⬇ Export PNG
                                </Button>
                                <Button variant="outlined" onClick={() => downloadHeatmap(job_id ?? "", "pdf")}>
                                    ⬇ Export PDF
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Modal */}
                    {isModalOpen && heatmapImageURL && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
                            onClick={() => setIsModalOpen(false)}
                        >
                            <div
                                className="relative bg-white rounded-xl shadow-2xl max-w-[90vw] max-h-[90vh] overflow-auto p-4"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600"
                                >
                                    ✕
                                </button>
                                <img src={heatmapImageURL} alt="Heatmap" className="max-w-full max-h-[80vh] object-contain"/>
                                <div className="flex justify-end gap-3 mt-3">
                                    <Button variant="outlined" onClick={() => downloadHeatmap(job_id ?? "", "png")}>
                                        ⬇ Export PNG
                                    </Button>
                                    <Button variant="outlined" onClick={() => downloadHeatmap(job_id ?? "", "pdf")}>
                                        ⬇ Export PDF
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
