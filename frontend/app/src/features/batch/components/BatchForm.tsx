import { useState } from "react";
import type { BatchFormData, BatchParametersResponse } from "../utils/types";
import {
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    TextField,
    Autocomplete,
    Chip,
    Box,
} from "@mui/material";

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

    const handleCovariatesChange = (_event: any, newValue: string[]) => {
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

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            {/* Batch Variable (Required) */}
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
                        {parameters.eligible_columns.map((col) => (
                            <MenuItem key={col} value={col}>
                                {col}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </div>

            {/* Covariates (Optional Multi-Select) */}
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
                    options={parameters.eligible_columns.filter(
                        (col) => col !== batchVariable
                    )}
                    value={covariates}
                    onChange={handleCovariatesChange}
                    disabled={isLoading}
                    renderValue={(value, getTagProps) =>
                        value.map((option, index) => (
                            <Chip
                                label={option}
                                {...getTagProps({ index })}
                            />
                        ))
                    }
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
            <Box
                className="rounded-lg border-2 border-amber-200 bg-amber-50 p-4"
            >
                <p className="text-sm text-amber-900">
                    <span className="font-semibold">ℹ️ Hinweis:</span> Die Covariates
                    dürfen nicht identisch mit der Batch Variable sein, um biologische
                    Signale zu erhalten.
                </p>
            </Box>

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
                    {isLoading ? "Korrektur läuft..." : "Korrektur starten"}
                </button>

                {onSkip && (
                    <button
                        type="button"
                        onClick={onSkip}
                        disabled={isLoading}
                        className="flex-1 px-6 py-3 rounded-lg font-semibold border-2 border-slate-300 text-slate-700 hover:bg-slate-50 transition"
                    >
                        Überspringen
                    </button>
                )}
            </div>
        </form>
    );
}