import React, { useState } from "react";
import {
  Alert,
  Autocomplete,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import HelpButton from "@shared/help/HelpButton.tsx";
import { colors } from "@shared/theme/colors.ts";
import { Button } from "@shared/components/Button.tsx";
import type { BatchFormData, BatchParametersResponse, GroupSelection } from "../types";
import { defaultGroupSelection, isComparisonReady, levelsOf, valuesOf } from "../utils/batchForm";
import BatchSampleSheetPreviewModal from "./BatchSampleSheetPreviewModal.tsx";

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
export function BatchForm({ parameters, onSubmit, isLoading = false, onSkip }: BatchFormProps) {
  const columns = parameters.columns ?? [];
  const columnNames = parameters.available_columns ?? columns.map((c) => c.name);

  const [batchVariable, setBatchVariable] = useState<string>("");
  const [covariates, setCovariates] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [clickedButton, setClickedButton] = useState<"batch" | "skip" | null>(null);

  const initialGroups = defaultGroupSelection(columns);
  const [analysisColumn, setAnalysisColumn] = useState<string>(initialGroups.group_column);
  const [caseGroup, setCaseGroup] = useState<string>(initialGroups.case_group);
  const [controlGroup, setControlGroup] = useState<string>(initialGroups.control_group);

  const analysisValues = valuesOf(columns, analysisColumn);
  const currentSelection: GroupSelection = {
    group_column: analysisColumn,
    case_group: caseGroup,
    control_group: controlGroup,
  };
  const analysisReady = isComparisonReady(currentSelection);

  const handleAnalysisColumnChange = (col: string) => {
    setAnalysisColumn(col);
    const vals = valuesOf(columns, col);
    setControlGroup(vals[0] ?? "");
    setCaseGroup(vals[1] ?? "");
  };

  const handleBatchVariableChange = (value: string) => {
    setBatchVariable(value);
    setValidationError(null);
    setCovariates((prev) => prev.filter((c) => c !== value));
  };

  const handleCovariatesChange = (_event: React.SyntheticEvent, newValue: string[]) => {
    setCovariates(newValue.filter((c) => c !== batchVariable));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!batchVariable) {
      setValidationError("Please select a batch variable.");
      return;
    }

    setValidationError(null);
    setClickedButton("batch");
    onSubmit({ batch_variable: batchVariable, covariates });
  };

  const handleSkip = () => {
    setClickedButton("skip");
    onSkip?.(columns.length > 0 ? currentSelection : undefined);
  };

  const filteredOptions = columnNames.filter((col) => col !== batchVariable);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">Batch Analysis &amp; Correction</h3>
        <HelpButton topic="batchCorrection" ariaLabel="Open batch correction help" />
        <Button variant="secondary" onClick={() => setShowPreview(true)} className="ml-auto">
          Preview sample sheet
        </Button>
      </div>

      {/* Batch variable select fields */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-neutral-textPrimary">
          Batch variable — technical factor to remove <span className="text-danger">*</span>
        </label>
        <p className="text-sm text-neutral-textSecondary">
          Its effect is removed from the data (e.g. chip / Sentrix_ID, plate). You decide which
          column is technical — open the preview if unsure.
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

      {/* Covariates multi-select inputs */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-neutral-textPrimary">
          Covariates — biological signal to protect (optional)
        </label>
        <p className="text-sm text-neutral-textSecondary">
          Preserved, never removed — typically your comparison group (the column may have any name).
          Multiple selections allowed.
        </p>

        <Autocomplete
          multiple
          id="covariates-autocomplete"
          options={filteredOptions}
          getOptionLabel={(name) => {
            const lv = levelsOf(columns, name);
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

      <Alert
        severity="info"
        variant="outlined"
        className="rounded-lg"
        sx={{
          bgcolor: colors.info.badgeBackground,
          borderColor: colors.info.DEFAULT,
          "& .MuiAlert-message": { color: colors.info.badgeText },
          "& .MuiAlert-icon": { color: colors.info.DEFAULT },
        }}
      >
        The batch variable and covariates play opposite roles: the batch variable is
        <strong> removed</strong>, covariates are <strong>protected</strong>. A column cannot be
        both. The tool does not judge whether a choice makes sense — use the SVD plot to decide.
      </Alert>

      {/* Differential group comparison section */}
      <div className="space-y-3 rounded-lg border border-neutral-borderDefault p-4">
        <label className="block text-sm font-semibold text-neutral-textPrimary">
          Differential analysis comparison (DMP/DMR)
        </label>
        <p className="text-xs text-neutral-textSecondary">
          Pick the biological column and the two groups to compare. The sign of Δβ is fixed as{" "}
          <strong>mean(Case) − mean(Control)</strong>. Use “Preview sample sheet” if a column name
          is unclear.
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

        <div className="flex gap-3 pt-2">
          <FormControl fullWidth disabled={isLoading || !analysisColumn} size="small">
            <InputLabel id="case-label">Case (treatment)</InputLabel>
            <Select
              labelId="case-label"
              value={caseGroup}
              label="Case (treatment)"
              onChange={(e) => setCaseGroup(e.target.value)}
            >
              {analysisValues.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={isLoading || !analysisColumn} size="small">
            <InputLabel id="control-label">Control (reference)</InputLabel>
            <Select
              labelId="control-label"
              value={controlGroup}
              label="Control (reference)"
              onChange={(e) => setControlGroup(e.target.value)}
            >
              {analysisValues.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        {analysisColumn !== "" && caseGroup === controlGroup && (
          <p className="text-xs text-danger">Case and control must be different groups.</p>
        )}
      </div>

      {validationError && (
        <p role="alert" className="text-sm text-danger">
          {validationError}
        </p>
      )}

      {/* Action buttons footer layout */}
      <div className="flex gap-4">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={!batchVariable || isLoading}
          className="flex-1"
        >
          {isLoading && clickedButton === "batch" ? "Batch ongoing..." : "Start Batch"}
        </Button>

        {onSkip && (
          <Button
            variant="secondary"
            size="lg"
            onClick={handleSkip}
            disabled={isLoading || (columns.length > 0 && !analysisReady)}
            className="flex-1"
          >
            {isLoading && clickedButton === "skip" ? "Starting…" : "Proceed to analysis"}
          </Button>
        )}
      </div>

      {showPreview && (
        <BatchSampleSheetPreviewModal
          jobId={parameters.job_id}
          onClose={() => setShowPreview(false)}
        />
      )}
    </form>
  );
}
