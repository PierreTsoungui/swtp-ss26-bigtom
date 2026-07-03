import React, {useEffect, useState} from "react";
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
import { helpTexts } from "../../../shared/utils/help/helpTexts.ts";
import { colors } from "../../../shared/theme/colors";

/**
 * Props für die {@link BatchForm} Komponente.
 */
interface BatchFormProps {
    /** Die vom Server oder der API bereitgestellten Parameter und verfügbaren Spalten. */
    parameters: BatchParametersResponse;
    /** Callback-Funktion, die beim erfolgreichen Absenden des Formulars aufgerufen wird. */
    onSubmit: (data: BatchFormData) => void;
    /** Zeigt an, ob die Batch-Korrektur aktuell verarbeitet wird (deaktiviert Interaktionen). */
    isLoading?: boolean;
    /** Optionaler Callback, um den Batch-Korrektur-Schritt zu überspringen. */
    onSkip?: () => void;

    // isSkipping?: boolean;
}

/**
 * Ein Formular zur Konfiguration und Durchführung einer Batch-Effekt-Korrektur.
 *
 * Erlaubt die Auswahl einer primären Batch-Variable (technischer Faktor) sowie optionaler
 * Covariates (biologische Gruppen), die während der Korrektur geschützt werden sollen.
 * Stellt sicher, dass die Batch-Variable nicht gleichzeitig als Covariate ausgewählt wird.
 *
 * @component
 * @param props - Die Props der Komponente gemäß {@link BatchFormProps}.
 * @returns Das gerenderte Batch-Korrektur-Formular als React-Element.
 */
export function BatchForm({
                              parameters,
                              onSubmit,
                              isLoading = false,
                              onSkip,
                          }: BatchFormProps) {
    const [batchVariable, setBatchVariable] = useState<string>("");
    const [covariates, setCovariates] = useState<string[]>([]);

    // 2. Lokaler State, um den aktiven Button zu tracken
    const [clickedButton, setClickedButton] = useState<"batch" | "skip" | null>(null);

    // 3. Reset, sobald das Laden beendet ist
    useEffect(() => {
        if (!isLoading) {
            setClickedButton(null);
        }
    }, [isLoading]);

    const handleBatchVariableChange = (value: string) => {
        setBatchVariable(value);
        setCovariates(covariates.filter((c) => c !== value));
    };

    const handleCovariatesChange = (
        _event: React.SyntheticEvent,
        newValue: string[]
    ) => {
        const filtered = newValue.filter((c) => c !== batchVariable);
        setCovariates(filtered);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!batchVariable) {
            alert("Bitte wählen Sie eine Batch Variable aus");
            return;
        }

        setClickedButton("batch"); // 4. Setze Klick auf "batch"
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

            {/* Batch Variable */}
            <div className="space-y-3">
                <label className="block text-sm font-semibold text-neutral-textPrimary">
                    Batch Variable <span className="text-danger">*</span>
                </label>
                <p className="text-sm text-neutral-textSecondary">
                    Technischer Faktor der korrigiert werden soll
                </p>

                <FormControl fullWidth disabled={isLoading}>
                    <InputLabel id="batch-variable-label">Bitte auswählen...</InputLabel>
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

            {/* Covariates */}
            <div className="space-y-3">
                <label className="block text-sm font-semibold text-neutral-textPrimary">
                    Covariates (Optional)
                </label>
                <p className="text-sm text-neutral-textSecondary">
                    Biologische Gruppen die NICHT verändert werden dürfen. Mehrfachauswahl möglich.
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
                            placeholder={covariates.length === 0 ? "Covariates auswählen..." : ""}
                        />
                    )}
                />
            </div>

            {/* Info Box */}
            <Alert
                severity="info"
                variant="outlined"
                className="rounded-lg"
                sx={{
                    bgcolor: colors.info.badgeBackground,
                    borderColor: colors.info.DEFAULT,
                    '& .MuiAlert-message': { color: colors.info.badgeText },
                    '& .MuiAlert-icon': { color: colors.info.DEFAULT }
                }}
            >
                Die Covariates dürfen nicht identisch mit der Batch Variable sein, um biologische Signale zu erhalten.
            </Alert>

            {/* Buttons */}
            <div className="flex gap-4">
                <button
                    type="submit"
                    disabled={!batchVariable || isLoading}
                    className={`flex-1 rounded-lg border-2 px-6 py-3 font-semibold transition-colors ${
                        batchVariable && !isLoading
                            ? "border-primary bg-primary text-primary-text hover:bg-primary-hover"
                            : "cursor-not-allowed border-neutral-textSecondary bg-neutral-surface text-neutral-textSecondary"
                    }`}
                >
                    {/* 5. Text ändert sich nur, wenn HIER geklickt wurde */}
                    {isLoading && clickedButton === "batch" ? "Batch ongoing..." : "Start Batch"}
                </button>

                {onSkip && (
                    <button
                        type="button"
                        onClick={() => {
                            setClickedButton("skip"); // 6. Setze Klick auf "skip"
                            onSkip();
                        }}
                        disabled={isLoading}
                        className={`flex-1 rounded-lg border-2 px-6 py-3 font-semibold transition-colors duration-200 ease-in-out ${
                            isLoading
                                ? 'cursor-not-allowed border-neutral-textSecondary bg-neutral-surface text-neutral-textSecondary'
                                : 'border-neutral-textSecondary bg-neutral-card text-neutral-textSecondary hover:bg-neutral-surface hover:text-neutral-textPrimary active:bg-neutral-borderDefault'
                        }`}
                    >
                        {/* 7. Text ändert sich nur, wenn HIER geklickt wurde */}
                        {isLoading && clickedButton === "skip" ? "Skipping..." : "Skip"}
                    </button>
                )}
            </div>
        </form>
    );
}
