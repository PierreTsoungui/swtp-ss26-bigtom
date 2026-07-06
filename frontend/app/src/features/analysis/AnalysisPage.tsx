import { type NavigateFunction, useNavigate, useParams } from "react-router";
import { Alert, AlertTitle } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";

import { useJobPolling } from "../../shared/hooks/useJobPolling";
import Progressbar from "../../shared/components/Progressbar.tsx";
import type { JobStatus } from "../../shared/types/JobTypes.ts";
import { FilteringStats } from "./components/FilteringStats";
import InfoPanel from "./components/InfoPanel.tsx";
import { useFilterStats } from "./hooks/useFilterStats.ts";
import {
  filterStatsAvailable,
  hasFailed,
  isPreviewReady,
  resolveErrorMessage,
  shouldShowProgress,
} from "./utils/analysisState";

/**
 * Main page for the filtering and normalization-preview phase.
 *
 * Responsibilities:
 * - Polls for {@link JobStatus} updates via {@link useJobPolling}.
 * - Fetches the filtering statistics once filtering completes.
 * - Renders the appropriate view for the current job state (loading, progress,
 *   success, failure) and lets the user advance to normalization.
 *
 * @remarks
 * All state derivations live in `./utils/analysisState` as pure functions, so
 * this component only wires those decisions to the rendered output.
 */
export function AnalysisPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const navigate: NavigateFunction = useNavigate();
  const jobStatus: JobStatus | null = useJobPolling(job_id ?? null);

  // The statistics are requested once filtering has completed and are keyed by
  // job id, so they load a single time and persist as the pipeline advances.
  const statsJobId = job_id && filterStatsAvailable(jobStatus) ? job_id : null;
  const { filterStats, isLoading: filterStatsLoading } = useFilterStats(statsJobId);

  const previewReady = isPreviewReady(jobStatus);

  if (!job_id) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-background px-6">
        <InfoPanel
          title="Analysis Not Available"
          message="No job identifier was provided for this analysis execution."
        />
      </main>
    );
  }

  if (!jobStatus) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <InfoPanel
          title="Preparing Analysis Pipeline"
          message="The analysis process is being initialized. Please wait..."
        />
      </main>
    );
  }

  if (filterStatsLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-background px-6">
        <InfoPanel
          title="Preparing Filter Statistics"
          message="The filtering step diagnostics are currently loading. Please wait..."
        />
      </main>
    );
  }

  // Failure before any statistics are available: show a full-screen error.
  if (hasFailed(jobStatus) && !filterStats) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-background px-6">
        <div className="w-full max-w-2xl">
          <Alert severity="error">
            <AlertTitle>Analysis failed</AlertTitle>
            {resolveErrorMessage(jobStatus, "An unknown error occurred.")}
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen justify-center bg-neutral-background px-6 py-10">
      <div className="w-full max-w-4xl space-y-6">
        {/* Progress bar with the "Next" action. */}
        {shouldShowProgress(jobStatus) && (
          <div data-testid="preview-progress">
            <Progressbar
              jobStatus={jobStatus}
              showNextButton={true}
              nextDisabled={!previewReady}
              onNext={() => void navigate(`/normalization/${job_id}`)}
            />
          </div>
        )}

        {/* Failure alongside already-loaded statistics. */}
        {hasFailed(jobStatus) && filterStats && (
          <Alert severity="error" sx={{ borderRadius: 2, border: "1px solid" }}>
            <AlertTitle>Normalization preview failed</AlertTitle>
            {resolveErrorMessage(jobStatus, "The preview could not be calculated.")}
          </Alert>
        )}

        {/* Success banner once the preview is ready. */}
        {previewReady && (
          <Alert
            severity="success"
            icon={<CheckIcon fontSize="inherit" />}
            className="rounded-lg border border-success bg-success-badgeBackground text-success-badgeText"
          >
            <AlertTitle className="font-semibold">
              Normalization preview successfully calculated
            </AlertTitle>
            <span className="text-sm mt-1 block">
              The preview is ready. You can now switch to the normalization method selection using
              the Next button.
            </span>
          </Alert>
        )}

        {filterStats && (
          <div data-testid="filtering-stats">
            <FilteringStats stats={filterStats} />
          </div>
        )}
      </div>
    </main>
  );
}
