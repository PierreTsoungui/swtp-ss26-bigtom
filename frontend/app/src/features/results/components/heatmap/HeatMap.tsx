import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { ArrowDropDown } from "@mui/icons-material";
import { useState } from "react";
import { useParams } from "react-router";

import { Button } from "@shared/components/Button.tsx";
import { useHeatMapOptions } from "../../hooks/useHeatMapOptions.ts";
import { useHeatMapGeneration } from "../../hooks/useHeatMapGeneration.ts";
import Progressbar from "@shared/components/Progressbar.tsx";
import ErrorMessage from "@shared/errors/ErrorMessage.tsx";
import { PlotView } from "@shared/plots";
import HelpButton from "@shared/help/HelpButton.tsx";

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
 * and optional secondary annotation column.
 *
 * This component is intentionally presentational: it owns only the form/UI state
 * (expansion, the two grouping selects), while the entire generation lifecycle —
 * the request, status polling, the resulting image, and error consolidation —
 * lives in {@link useHeatMapGeneration}.
 */
function HeatMap({ filters, rowCount }: HeatMapProps) {
  const { job_id } = useParams<{ job_id: string }>();
  const [isExpanded, setIsExpanded] = useState(false);

  const [primaryGrouping, setPrimaryGrouping] = useState("");
  const [secondaryGrouping, setSecondaryGrouping] = useState("");

  const { data: options, isLoading: optionsLoading } = useHeatMapOptions(job_id ?? null);
  const {
    jobStatus,
    isGenerating,
    isPolling,
    heatmapSource,
    displayedError,
    showError,
    dismissError,
    generate,
  } = useHeatMapGeneration(job_id ?? null);

  const availableColumns = options?.available_columns ?? [];
  const secondaryOptions = availableColumns.filter((column) => column.name !== primaryGrouping);

  const tooMany = rowCount != null && rowCount > MAX_CPGS;
  const noRows = rowCount != null && rowCount === 0;

  const handleGenerate = async () => {
    if (!primaryGrouping || tooMany || noRows) {
      return;
    }

    // Forward only the non-empty applied table filters (single filter source).
    const activeFilters = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v !== "" && v != null),
    );

    await generate({
      filters: activeFilters,
      grouping: {
        primary: primaryGrouping,
        secondary: secondaryGrouping || undefined,
      },
    });
  };

  return (
    <Accordion expanded={isExpanded} onChange={() => setIsExpanded(!isExpanded)}>
      <AccordionSummary expandIcon={<ArrowDropDown />}>
        <Typography variant="h6">Heatmap</Typography>
      </AccordionSummary>

      <AccordionDetails>
        <div className="space-y-6">
          {/* Filter selection notice + contextual help for the heatmap.
                        The help trigger lives here (not in the summary, which is
                        itself a <button>) to keep the DOM valid — no nested buttons. */}
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate-500">
              The heatmap uses the filters currently applied to the DMP table
              {rowCount != null && (
                <>
                  {" "}
                  — <strong>{rowCount}</strong> CpG{rowCount === 1 ? "" : "s"} selected
                </>
              )}
              .
            </p>
            <HelpButton topic="heatmap" ariaLabel="Open heatmap help" />
          </div>

          {/* Row-limit / empty pre-checks */}
          {tooMany && (
            <p className="text-sm text-danger">
              The current filter selects {rowCount} CpGs, which exceeds the limit of {MAX_CPGS}.
              Please tighten the filter (e.g. adjusted p-value or |Δβ|) before generating the
              heatmap.
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
              variant="primary"
              disabled={!primaryGrouping || isGenerating || tooMany || noRows}
              onClick={() => void handleGenerate()}
            >
              Generate Heatmap
            </Button>
          </div>

          {/* Progress */}
          {(isPolling || isGenerating) && (
            <div className="mt-4">
              {jobStatus ? (
                <Progressbar jobStatus={jobStatus} />
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
              onClose={dismissError}
            />
          )}

          {/* Result */}
          {heatmapSource && <PlotView source={heatmapSource} maxHeightClass="max-h-64" />}
        </div>
      </AccordionDetails>
    </Accordion>
  );
}

export default HeatMap;
