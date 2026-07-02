import React, {useEffect, useState} from "react";
import type { BatchFormData, BatchParametersResponse, GroupSelection } from "../utils/types";
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
import SampleSheetPreviewModal from "./SampleSheetPreviewModal.tsx";

/**
 * Props for the {@link BatchForm} component.
 */
interface BatchFormProps {
    /** Available metadata columns and group values provided by the API. */
    parameters: BatchParametersResponse;
    /** Callback to trigger a new batch correction round. */
    onSubmit: (data: BatchFormData) => void;
    /** Disables interactions while a correction is in progress. */
    isLoading?: boolean;
    /** Finalizes the workflow and proceeds to DMP/DMR analysis with the chosen comparison. */
    onSkip?: (selection?: GroupSelection) => void;
}


/**
 * A configuration interface for identifying and correcting technical batch effects.
 *
 * It allows the user to:
 * 1. Select a **Batch Variable** (technical noise) to be removed.
 * 2. Define **Covariates** (biological signal) to be protected.
 * 3. Configure the **Case vs. Control** groups for final differential analysis.
 */
export function BatchForm({
                              parameters,
                              onSubmit,
                              isLoading = false,
                              onSkip,
                          }: BatchFormProps) {
    const [batchVariable, setBatchVariable] = useState<string>("");
    const [covariates, setCovariates] = useState<string[]>([]);
    const [showPreview, setShowPreview] = useState<boolean>(false);

    // 2. Lokaler State, um den aktiven Button zu tracken
    const [clickedButton, setClickedButton] = useState<"batch" | "skip" | null>(null);

    const columns = parameters.columns ?? [];
    const columnNames = parameters.available_columns ?? columns.map((c) => c.name);

    // Label helper: "Sentrix_ID (4 groups)".
    const levelsOf = (name: string) =>
        columns.find((c) => c.name === name)?.levels;
    const valuesOf = (name: string) =>
        columns.find((c) => c.name === name)?.values ?? [];

    // ── DMP/DMR comparison (case vs control) — chosen before "Proceed" ──────────
    const [analysisColumn, setAnalysisColumn] = useState<string>("");
    const [caseGroup, setCaseGroup] = useState<string>("");
    const [controlGroup, setControlGroup] = useState<string>("");

    // Sensible default once the columns arrive: first column, its first two values.
    useEffect(() => {
        if (!analysisColumn && columns.length > 0) {
            const first = columns[0];
            setAnalysisColumn(first.name);
            setControlGroup(first.values[0] ?? "");
            setCaseGroup(first.values[1] ?? "");
        }
    }, [columns, analysisColumn]);

    const handleAnalysisColumnChange = (col: string) => {
        setAnalysisColumn(col);
        const vals = valuesOf(col);
        setControlGroup(vals[0] ?? "");
        setCaseGroup(vals[1] ?? "");
    };

    const analysisValues = valuesOf(analysisColumn);
    const analysisReady =
        analysisColumn !== "" && caseGroup !== "" && controlGroup !== "" && caseGroup !== controlGroup;

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

    const filteredOptions = columnNames.filter((col) => col !== batchVariable);

    return (
        <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold">Batch Analysis &amp; Correction</h3>
                <HelpButton
                    helpText={helpTexts.batchCorrection}
                    ariaLabel="Hilfe zur Batch-Korrektur öffnen"
                    dialogTitle="Batch Effects & Batch Correction"
                />
                <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className="ml-auto rounded-lg border border-primary px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-text"
                >
                    Preview sample sheet
                </button>
            </div>

            {/* Batch variable — technical factor to REMOVE */}
            <div className="space-y-2">
                <label className="block text-sm font-semibold text-neutral-textPrimary">
                    Batch variable — technical factor to remove <span className="text-danger">*</span>
                </label>
                <p className="text-xs text-neutral-textSecondary">
                    Its effect is removed from the data (e.g. chip / Sentrix_ID, plate). You decide
                    which column is technical — open the preview if unsure.
                </p>

                <FormControl fullWidth disabled={isLoading}>
                    <InputLabel id="batch-variable-label">Select a column…</InputLabel>
                    <Select
                        labelId="batch-variable-label"
                        id="batch-variable-select"
                        value={batchVariable}
                        label="Select a column…"
                        onChange={(e) => handleBatchVariableChange(e.target.value)}
                    >
                        {columns.map((col) => (
                            <MenuItem key={col.name} value={col.name}>
                                {col.name} ({col.levels} groups)
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </div>

            {/* Covariates — biological signal to PROTECT */}
            <div className="space-y-2">
                <label className="block text-sm font-semibold text-neutral-textPrimary">
                    Covariates — biological signal to protect (optional)
                </label>
                <p className="text-xs text-neutral-textSecondary">
                    Preserved, never removed — typically your comparison group (the column may have
                    any name). Multiple selections allowed.
                </p>

                <Autocomplete
                    multiple
                    id="covariates-autocomplete"
                    options={filteredOptions}
                    getOptionLabel={(name) => {
                        const lv = levelsOf(name);
                        return lv ? `${name} (${lv} groups)` : name;
                    }}
                    value={covariates}
                    onChange={handleCovariatesChange}
                    disabled={isLoading}
                    freeSolo={false}
                    noOptionsText="No columns available"
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            placeholder={covariates.length === 0 ? "Select covariates…" : ""}
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
                The batch variable and covariates play opposite roles: the batch variable is
                <strong> removed</strong>, covariates are <strong>protected</strong>. A column cannot
                be both. The tool does not judge whether a choice makes sense — use the SVD plot to
                decide.
            </Alert>

            {/* Differential analysis (DMP/DMR): comparison column + case + control */}
            <div className="space-y-3 rounded-lg border border-neutral-borderDefault p-4">
                <label className="block text-sm font-semibold text-neutral-textPrimary">
                    Differential analysis comparison (DMP/DMR)
                </label>
                <p className="text-xs text-neutral-textSecondary">
                    Pick the biological column and the two groups to compare. The sign of Δβ is
                    fixed as <strong>mean(Case) − mean(Control)</strong>. Use “Preview sample sheet”
                    if a column name is unclear.
                </p>

                <FormControl fullWidth disabled={isLoading} size="small">
                    <InputLabel id="analysis-column-label">Comparison column</InputLabel>
                    <Select
                        labelId="analysis-column-label"
                        value={analysisColumn}
                        label="Comparison column"
                        onChange={(e) => handleAnalysisColumnChange(e.target.value)}
                    >
                        {columns.map((col) => (
                            <MenuItem key={col.name} value={col.name}>
                                {col.name} ({col.levels} groups)
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>

                <div className="flex gap-3">
                    <FormControl fullWidth disabled={isLoading || !analysisColumn} size="small">
                        <InputLabel id="case-label">Case (treatment)</InputLabel>
                        <Select labelId="case-label" value={caseGroup} label="Case (treatment)"
                                onChange={(e) => setCaseGroup(e.target.value)}>
                            {analysisValues.map((v) => (
                                <MenuItem key={v} value={v}>{v}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl fullWidth disabled={isLoading || !analysisColumn} size="small">
                        <InputLabel id="control-label">Control (reference)</InputLabel>
                        <Select labelId="control-label" value={controlGroup} label="Control (reference)"
                                onChange={(e) => setControlGroup(e.target.value)}>
                            {analysisValues.map((v) => (
                                <MenuItem key={v} value={v}>{v}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </div>
                {analysisColumn !== "" && caseGroup === controlGroup && (
                    <p className="text-xs text-danger">Case and control must be different groups.</p>
                )}
            </div>

            {/* Buttons */}
            <div className="flex gap-4">
                <button
                    type="submit"
                    disabled={!batchVariable || isLoading}
                    className={`flex-1 px-6 py-3 rounded-lg font-semibold transition ${
                        batchVariable && !isLoading
                            ? "bg-primary text-primary-text hover:bg-primary-hover"
                            : "bg-neutral-borderEmphasis text-neutral-textSecondary cursor-not-allowed"
                    }`}
                >
                    {/* 5. Text ändert sich nur, wenn HIER geklickt wurde */}
                    {isLoading && clickedButton === "batch" ? "Batch ongoing..." : "Start Batch"}
                </button>

                {onSkip && (
                    <button
                        type="button"
                        onClick={() => {
                            setClickedButton("skip");
                            onSkip(
                                columns.length > 0
                                    ? { group_column: analysisColumn, case_group: caseGroup, control_group: controlGroup }
                                    : undefined,
                            );
                        }}
                        disabled={isLoading || (columns.length > 0 && !analysisReady)}
                        className={`flex-1 px-6 py-3 rounded-lg font-semibold border-2 border-neutral-borderEmphasis transition-colors duration-200 ease-in-out ${
                            isLoading || (columns.length > 0 && !analysisReady)
                                ? 'bg-neutral-card text-neutral-textDisabled cursor-not-allowed opacity-50'
                                : 'text-neutral-textSecondary bg-neutral-card hover:bg-neutral-surface hover:border-neutral-textDisabled active:bg-neutral-borderDefault'
                        }`}
                    >
                        {/* 7. Text change only when clicked here */}
                        {isLoading && clickedButton === "skip" ? "Starting…" : "Proceed to analysis"}
                    </button>
                )}
            </div>

            {showPreview && (
                <SampleSheetPreviewModal
                    jobId={parameters.job_id}
                    onClose={() => setShowPreview(false)}
                />
            )}
        </form>
    );
}