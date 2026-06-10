import {Accordion, AccordionDetails, AccordionSummary, InputLabel, Select, Typography} from "@mui/material";
import {useState} from "react";
import {ArrowDropDown} from "@mui/icons-material";
import {useJobPolling} from "../../../analysis/hooks/useJobPolling.ts";
import {useParams} from "react-router-dom";
import type {JobStatus} from "../../../analysis/utils/types.ts";


function HeatMap()  {
    const {job_id} = useParams<{ job_id: string }>();
    const [isExpanded, setIsExpanded] = useState(false);
    // useGenerateHeatMap nutzen und
    const jobStatus : JobStatus | null = useJobPolling(job_id ?? null);

    return (
        <Accordion expanded={isExpanded}>
            <AccordionSummary
                expandIcon={<ArrowDropDown />}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <Typography component="span" variant="h6">Heatmap</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <div className="w-full h-64 bg-gray-200 flex flex-row justify-center px-6">
                    <label>
                        Hauptsortierung <span className="text-red-500">*</span>
                    </label>
                    <InputLabel id="heatmap-variable-label">
                        Bitte auswählen...
                    </InputLabel>
                    <Select variant="outlined" labelId="heatmap-variable-label">

                    </Select>
                </div>

                <button>
                    Generate Heatmap
                </button>

                {/* Progressbar anzeigen, wenn loading */}

                {/* Bild anzeigen Heatmap */}

                <button>
                    Download as PNG
                </button>

            </AccordionDetails>
        </Accordion>
    );
}

export default HeatMap;


/*
            <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-900">
                    Batch Variable <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-slate-500">
                    Technischer Faktor der korrigiert werden soll
                </p>

                <FormControl fullWidth disabled={isLoading}>
                    <InputLabel id="batch-variable-label">
                        Bitte auswählen...
                    </InputLabel>
                    <Select
                        labelId="batch-variable-label"
                        id="batch-variable-select"
                        value={batchVariable}
                        label="Bitte auswählen..."
                        onChange={(e) => handleBatchVariableChange(e.target.value)}
                    >
                        {parameters.available_columns.map((col) => (
                            <MenuItem key={col} value={col}>
                                {col}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </div>

<div className="space-y-3">
    <label className="block text-sm font-semibold text-slate-900">
        Covariates (Optional)
    </label>
    <p className="text-xs text-slate-500">
        Biologische Gruppen die NICHT verändert werden dürfen. Mehrfachauswahl
        möglich.
    </p>

    <Autocomplete
        multiple
        id="covariates-autocomplete"
        options={filteredOptions}
        value={covariates}
        onChange={handleCovariatesChange}
        disabled={isLoading}
        freeSolo={false}
        noOptionsText="Keine Optionen verfügbar"
        renderInput={(params) => (
            <TextField
                {...params}
                placeholder={
                    covariates.length === 0 ? "Covariates auswählen..." : ""
                }
            />
        )}
    />
</div>
 */