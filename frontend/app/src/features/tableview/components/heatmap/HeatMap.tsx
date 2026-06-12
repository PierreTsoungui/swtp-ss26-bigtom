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
import { ArrowDropDown } from "@mui/icons-material";
import {useEffect, useState} from "react";
import { useParams } from "react-router-dom";

import { useJobPolling } from "../../../analysis/hooks/useJobPolling.ts";

import type { JobStatus } from "../../../analysis/utils/types.ts";
import {useHeatMapOptions} from "../../hooks/useHeatMapOptions.ts";
import {useGenerateHeatMap} from "../../hooks/useGenerateHeatMap.ts";
import Progressbar from "../../../../shared/components/Progressbar.tsx";
import ErrorMessage from "../../../../shared/error-handling/components/ErrorMessage.tsx";
import downloadHeatmap from "../../utils/downloadHeatmap.ts";
import type {HeatmapDmpFilter} from "../../utils/types.ts";


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

    console.log("[HeatMap] optionsLoading:", optionsLoading);
    console.log("[HeatMap] options data:", options);
    console.log("[HeatMap] availableColumns:", options?.available_columns);

    const availableColumns = options?.available_columns ?? [];
    console.log("HeatMap Component - availableColumns:", availableColumns);

    const secondaryOptions = availableColumns.filter(
        (column) => column !== primaryGrouping,
    );

    const handleGenerate = async () => {
        if (!primaryGrouping) {
            return;
        }
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
        if (
            jobStatus.phase === "heatmap" && jobStatus.status !== "running" ||
            jobStatus.status === "heatmap_done" ||
            jobStatus.status === "failed"
        ) {
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
                    {isHeatmapPolling && jobStatus && (
                        <Progressbar jobStatus={jobStatus} />
                    )}

                    {/* Error */}
                    {error && (
                        <ErrorMessage open={true} error={error} vertical="top" horizontal="center" />
                    )}

                    {/* Heatmap Anzeige */}
                    {heatmapResponse && (
                        <div className="space-y-4">

                            <div className="border rounded-lg p-4 bg-slate-50">
                                <div className="flex items-center justify-center min-h-100">
                                    <img
                                        src={`/api/v1/heatmap/${job_id}`}
                                        alt="Generierte Heatmap"
                                        className="max-w-full max-h-96 object-contain"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button
                                    variant="outlined"
                                    onClick={() => downloadHeatmap(heatmapResponse.job_id)}
                                >
                                    Export as PNG
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </AccordionDetails>
        </Accordion>
    );
}

export default HeatMap;