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
import { useState } from "react";
import { useParams } from "react-router-dom";

import { useJobPolling } from "../../../analysis/hooks/useJobPolling.ts";

import type { JobStatus } from "../../../analysis/utils/types.ts";
import {useHeatMapOptions} from "../../hooks/useHeatMapOptions.ts";
import {useGenerateHeatMap} from "../../hooks/useGenerateHeatMap.ts";
import Progressbar from "../../../../shared/components/Progressbar.tsx";
import ErrorMessage from "../../../../shared/error-handling/components/ErrorMessage.tsx";
import downloadHeatmap from "../../utils/downloadHeatmap.ts";

/**
 * Hauptkomponente für die Heatmap Funktionalität. Ermöglicht die Auswahl von Gruppierungsspalten und das Generieren der Heatmap.
 *
 * @note Diese Komponente wird nur als aufklappbares Accordion dargestellt,
 * welches in der DMP-Ansicht eingebettet ist. Sie ist nicht als eigenständige Seite gedacht.
 * @constructor
 */
function HeatMap() {
    const { job_id } = useParams<{ job_id: string }>();

    const [isExpanded, setIsExpanded] = useState(false);

    const [primaryGrouping, setPrimaryGrouping] = useState("");
    const [secondaryGrouping, setSecondaryGrouping] = useState("");

    const jobStatus: JobStatus | null = useJobPolling(job_id ?? null);

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

    const availableColumns = options?.available_columns ?? [];

    const secondaryOptions = availableColumns.filter(
        (column) => column !== primaryGrouping,
    );

    const handleGenerate = async () => {
        if (!primaryGrouping) {
            return;
        }

        await generateHeatMap({
            dmp_filter: {
                // später die aktiven DMP Filter einsetzen
            },
            grouping: {
                primary: primaryGrouping,
                secondary: secondaryGrouping || undefined,
            },
        });
    };

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
                    {(isGenerating ||
                        jobStatus?.status === "running") && jobStatus !== null && (
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

                                    {/* TODO: Hier später PNG laden */}
                                    <Typography color="text.secondary">
                                        Heatmap Vorschau
                                    </Typography>

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