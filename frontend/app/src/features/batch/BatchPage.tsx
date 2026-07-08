import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import Progressbar from "@shared/components/Progressbar.tsx";
import { useJobPolling } from "@shared/hooks/useJobPolling.ts";
import { JobStatusValue } from "@shared/types/JobTypes.ts";
import { BatchForm } from "./components/BatchForm";
import { SvdPlot } from "./components/SvdPlot";
import { useBatchCorrection } from "./hooks/useBatchCorrection";
import { useBatchParameters } from "./hooks/useBatchParameters";
import type { BatchFormData, GroupSelection } from "./types";
import { hasReachedResults, isDownstreamRunning, isSystemError } from "./utils/batchState";
import { BatchRoundTracker } from "./utils/batchRoundTracker";

/**
 * Main view for identifying and mitigating technical batch effects.
 *
 * Responsibilities:
 * - Visualizes variance components via {@link SvdPlot} based on the round history.
 * - Collects batch-variable/covariate configuration via {@link BatchForm}.
 * - Runs correction rounds or skips ahead to differential analysis (DMP/DMR).
 * - Monitors the long-running server-side pipeline via {@link useJobPolling} and
 *   navigates to the results page once analysis completes.
 *
 * @remarks
 * Pure state derivations live in `./utils/batchState`; this component only wires
 * those decisions to polling, submission, and navigation.
 */
export function BatchPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const navigate = useNavigate();

  const [showProgressBar, setShowProgressBar] = useState(false);
  // Bumped on each submission to restart polling for the new round.
  const [pollingKey, setPollingKey] = useState(0);

  /** Available metadata columns for the dropdown selections. */
  const { parameters, isLoading: parametersLoading } = useBatchParameters(job_id ?? null);

  /** History plus the run/skip actions for the correction workflow. */
  const {
    history,
    loading: historyLoading,
    error,
    runBatch,
    skipBatch,
    isSubmitting,
    fetchHistory
  } = useBatchCorrection(job_id);

  // Distinguishes a real round completion from the stale BATCH+WAITING status
  // that lingers from the *previous* round (the race that made round 2+ show no
  // progress bar). Held in a ref so startRound() takes effect synchronously in
  // the submit handler; only ever touched inside effects and event handlers, so
  // it is never read during render.
  const roundTrackerRef = useRef<BatchRoundTracker | null>(null);
  const getRoundTracker = (): BatchRoundTracker => {
    roundTrackerRef.current ??= new BatchRoundTracker();
    return roundTrackerRef.current;
  };

  const jobStatus = useJobPolling(showProgressBar && job_id ? job_id : null, pollingKey);
  const batchRunning = isSubmitting && jobStatus?.status === JobStatusValue.RUNNING;

  // React to polled job-status changes: drive the progress bar, detect a round
  // completion, and hand off to the results page once analysis is done.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       This effect synchronizes UI state with the external polling system: it
       reflects the latest job status onto the progress bar and triggers a
       one-time navigation when the pipeline reaches its results stage. */
    if (!jobStatus) {
      return;
    }

    // Feed the tracker every status so it can observe this round running; it
    // reports completion only for a round it has actually seen run (guards the
    // stale-WAITING race). Kept before the branches below so it is never skipped.
    const batchFinished = getRoundTracker().observe(jobStatus);

    if (isDownstreamRunning(jobStatus)) {
      setShowProgressBar(true);
      return;
    }

    if (hasReachedResults(jobStatus)) {
      setShowProgressBar(false);
      void navigate(`/results/${job_id}`);
      return;
    }

    if (batchFinished && showProgressBar) {
      setShowProgressBar(false);
      void fetchHistory();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [jobStatus, showProgressBar, navigate, job_id]);

  if (!job_id) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <h2 className="text-xl font-semibold text-neutral-textPrimary">
          No job identifier provided
        </h2>
      </main>
    );
  }

  if (parametersLoading || historyLoading) {
    return (
      <main className="mx-auto max-w-5xl p-8">
        <p className="text-neutral-textSecondary">Loading batch data…</p>
      </main>
    );
  }

  const handleSubmit = async (data: BatchFormData) => {
    // Start a fresh cycle: the previous round's WAITING must not count as done
    // until we observe THIS run executing.
    getRoundTracker().startRound();
    await runBatch({
      batch_correction: {
        batch_variable: data.batch_variable,
        covariates: data.covariates,
      },
    });
    setPollingKey((prev) => prev + 1);
    setShowProgressBar(true);
  };

  const handleSkip = async (selection?: GroupSelection) => {
    getRoundTracker().startRound();
    await skipBatch(selection);
    setPollingKey((prev) => prev + 1);
    setShowProgressBar(true);
  };

  return (
    <main className="mx-auto max-w-5xl p-5">
      <h2 className="mb-4 text-2xl font-bold text-neutral-textPrimary">Batch Effect Correction</h2>

      {isSystemError(error) && error && (
        <div className="mb-5 rounded-md bg-danger-badgeBackground px-4 py-3 text-danger-badgeText">
          <strong>System Error:</strong> {error.message}
        </div>
      )}

      {history && (
        <div className="mb-8">
          <SvdPlot rounds={history.rounds} />
        </div>
      )}

      {parameters && (
        <BatchForm
          parameters={parameters}
          isLoading={batchRunning || showProgressBar}
          onSubmit={(data) => void handleSubmit(data)}
          onSkip={(selection) => void handleSkip(selection)}
        />
      )}

      {showProgressBar && jobStatus && (
        <div className="my-5 flex w-full justify-center">
          <Progressbar jobStatus={jobStatus} />
        </div>
      )}
    </main>
  );
}
