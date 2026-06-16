import React, { useState } from "react";
import type { BatchFormData, BatchParametersResponse } from "../utils/types";
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Autocomplete,
    Alert,
} from "@mui/material";
import HelpButton from "../../analysis/components/HelpButton.tsx";
import { helpTexts } from "../../help/helpTexts.ts";

interface BatchFormProps {
    parameters: BatchParametersResponse;
    onSubmit: (data: BatchFormData) => void;
    isLoading?: boolean;
    onSkip?: () => void;
}

export function BatchForm({
                              parameters,
                              onSubmit,
                              isLoading = false,
                              onSkip,
                          }: BatchFormProps) {
    const [batchVariable, setBatchVariable] = useState<string>("");
    const [covariates, setCovariates] = useState<string[]>([]);

    const handleBatchVariableChange = (value: string) => {
        setBatchVariable(value);
        // Entferne batch_variable aus covariates wenn sie ausgewählt ist
        setCovariates(covariates.filter((c) => c !== value));
    };

    const handleCovariatesChange = (
        _event: React.SyntheticEvent,
        newValue: string[]
    ) => {
        // Verhindere, dass die Batch Variable in Covariates aufgenommen wird
        const filtered = newValue.filter((c) => c !== batchVariable);
        setCovariates(filtered);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!batchVariable) {
            alert("Bitte wählen Sie eine Batch Variable aus");
            return;
        }
        onSubmit({ batch_variable: batchVariable, covariates });
    };

    const filteredOptions = parameters.available_columns.filter(
        (col) => col !== batchVariable
    );

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">Batch Analysis &amp; Correction</h3>
                <HelpButton
                    helpText={helpTexts.batchCorrection}
                    ariaLabel="Hilfe zur Batch-Korrektur öffnen"
                    dialogTitle="Batch Effects & Batch Correction"
                />
            </div>

            {/* Batch Variable (Required) - SELECT Dropdown */}
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

            {/* Covariates (Optional Multi-Select) - AUTOCOMPLETE */}
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

            {/* Info Box */}
            {/*<Box className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-900">
                    <Alert severity="info">Die Covariates
                        dürfen nicht identisch mit der Batch Variable sein, um biologische
                        Signale zu erhalten.</Alert>
                </p>
            </Box>*/}
            <Alert
                severity="info"
                variant="outlined"
                className="rounded-lg"
                sx={{
                    bgcolor: 'amber.50',
                    borderColor: 'amber.200',
                    '& .MuiAlert-message': { color: 'amber.900' },
                    '& .MuiAlert-icon': { color: 'amber.600' } // Adjust icon color to match
                }}
            >
                Die Covariates dürfen nicht identisch mit der Batch Variable sein, um biologische Signale zu erhalten.
            </Alert>

            {/* Buttons */}
            <div className="flex gap-4">
                <button
                    type="submit"
                    disabled={!batchVariable || isLoading}
                    className={`flex-1 px-6 py-3 rounded-lg font-semibold transition ${
                        batchVariable && !isLoading
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-slate-300 text-slate-500 cursor-not-allowed"
                    }`}
                >
                    {isLoading ? "Batch ongoing..." : "Start Batch"}
                </button>

                {onSkip && (
                    <button
                        type="button"
                        onClick={onSkip}
                        disabled={isLoading}
                        className="
                            flex-1 px-6 py-3
                            rounded-lg font-semibold
                            border-2 border-slate-300
                            text-slate-700
                            bg-white
                            transition-colors duration-200 ease-in-out
                            hover:bg-slate-100 hover:border-slate-400
                            active:bg-slate-200
                            disabled:opacity-50 disabled:cursor-not-allowed
                            disabled:hover:bg-white disabled:hover:border-slate-300"
                    >
                        {isLoading ? "Läuft..." : "Skip"}
                    </button>
                )}
            </div>
        </form>
    );
}
