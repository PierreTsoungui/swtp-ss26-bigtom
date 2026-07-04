import { useParams } from "react-router-dom";
import React, { useEffect, useRef, useState } from "react";

import { BatchForm } from "./components/BatchForm";
import { SvdPlot } from "./components/SvdPlot";
import { useBatchParameters } from "./hooks/useBatchParameters";
import { useBatchCorrection } from "./hooks/useBatchCorrection";
import { BatchRoundTracker } from "./utils/batchRoundTracker";
import { useJobPolling } from "../analysis/hooks/useJobPolling";
import Progressbar from "../../shared/components/Progressbar";
import { colors } from "../../shared/theme/colors";
import type { BatchFormData, GroupSelection } from "./utils/types";
import {useNavigate} from "react-router";
import {JobPhase, JobStatusValue} from "../../shared/utils/JobTypes.ts";

/**
 * Main view for identifying and mitigating technical batch effects.
 *
 * Responsibilities:
 * - Visualizes variance components via {@link SvdPlot} based on the analysis history.
 * - Collects user configuration for batch variables and covariates via {@link BatchForm}.
 * - Manages the transition to downstream differential methylation analysis (DMP/DMR).
 * - Monitors long-running server-side corrections using {@link useJobPolling}.
 */
const BatchPage: React.FC = () => {
  const { job_id } = useParams<{ job_id: string }>();
  const [showProgressBar, setShowProgressBar] = useState(false);
  const navigate = useNavigate();

  /** Fetches available metadata columns for the dropdown selections. */
  const {
    parameters,
    isLoading: parametersLoading,
  } = useBatchParameters(job_id ?? null);

  /** Logic for submitting batch correction or skipping to final analysis. */
  const {
    history,
    loading: historyLoading,
    error,
    runBatch,
    skipBatch,
    fetchHistory,
    isSubmitting,
  } = useBatchCorrection(job_id, () => {});

  const [pollingKey, setPollingKey] = useState(0);

  // Distinguishes a real round completion from the stale BATCH+WAITING status
  // that lingers from the *previous* round (the race that made round 2+ show no
  // progress bar). Held in a ref so startRound() takes effect synchronously in
  // the submit handler, before the effect below re-runs. Lazily initialised so
  // the instance is created exactly once.
  const roundTrackerRef = useRef<BatchRoundTracker | null>(null);
  if (roundTrackerRef.current === null) {
    roundTrackerRef.current = new BatchRoundTracker();
  }
  const roundTracker = roundTrackerRef.current;

  // Status Polling
  const jobStatus = useJobPolling(
      showProgressBar && job_id ? job_id : null,
      pollingKey
  );
  const batchRunning = isSubmitting && jobStatus?.status === JobStatusValue.RUNNING;

  // React to job-status changes: drive the progress bar and detect completion.
  useEffect(() => {
    if (!jobStatus) return;

    // Feed the tracker every status so it can observe this round running; it
    // reports completion only for a round it has actually seen run (guards the
    // stale-WAITING race). Kept separate from the early-returning analysis
    // branches below so the observation is never skipped.
    const batchFinished = roundTracker.observe(jobStatus);

    // Downstream analysis (DMP/DMR) is running.
    if (jobStatus.phase === JobPhase.ANALYSIS && jobStatus.status === JobStatusValue.RUNNING) {
      setShowProgressBar(true);
      return;
    }
    // Downstream analysis finished -> move on to the results page.
    else if ((jobStatus.phase === JobPhase.ANALYSIS && jobStatus.status === JobStatusValue.COMPLETED) ||
             (jobStatus.phase === JobPhase.RESULTS && jobStatus.status === JobStatusValue.WAITING)
    ) {
      setShowProgressBar(false);
      fetchHistory();
      navigate(`/results/${job_id}`);
      return;
    }

    // A batch round finished: hide the progress bar and reload the SVD history.
    if (batchFinished && showProgressBar) {
      setShowProgressBar(false);
      fetchHistory();
    }

  }, [jobStatus, showProgressBar, fetchHistory, navigate, job_id, roundTracker]);

  if (!job_id) {
    return (
        <div className="p-8">
          <h2>Keine Job-ID vorhanden</h2>
        </div>
    );
  }

  if (parametersLoading || historyLoading) {
    return (
        <div className="p-8">
          Lade Batch-Daten...
        </div>
    );
  }

  const handleSubmit = async (data: BatchFormData) => {
    // Start a fresh cycle: the previous round's WAITING must not count as done
    // until we observe THIS run executing.
    roundTracker.startRound();
    await runBatch({
      batch_correction: {
        batch_variable: data.batch_variable,
        covariates: data.covariates,
      },
    });
    setPollingKey(prev => prev + 1); // reset polling for the new round
    setShowProgressBar(true);
  };

  const handleSkip = async (selection?: GroupSelection) => {
    roundTracker.startRound();
    await skipBatch(selection);
    setPollingKey(prev => prev + 1); // reset polling for the new round
    setShowProgressBar(true);
  };

  const isGlobalError =
      error &&
      (
          error.error === "BATCH_FAILED" ||
          error.error === "NETWORK_ERROR"
      );

  return (
      <div
          style={{
            maxWidth: "1200px",
            margin: "0 auto",
            padding: "20px",
          }}
      >
        <h2 className="text-2xl font-bold mb-4">Batch Effect Correction</h2>

        {isGlobalError && (
            <div
                style={{
                  padding: "15px",
                  backgroundColor: colors.danger.badgeBackground,
                  color: colors.danger.badgeText,
                  borderRadius: "4px",
                  marginBottom: "20px",
                }}
            >
              <strong>System Error:</strong>{" "}
              {error.message}
            </div>
        )}

        {/* SVD Plot */}

        {history && (
            <div style={{ marginBottom: "30px" }}>
              <SvdPlot rounds={history.rounds} />
            </div>
        )}

        {/* Batch Form */}

        {parameters && (
            <BatchForm
                parameters={parameters}
                isLoading={batchRunning || showProgressBar}
                onSubmit={handleSubmit}
                onSkip={handleSkip}
            />
        )}

        {/* Progressbar */}
        {showProgressBar && jobStatus && (
            <div
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "center",
                  margin: "20px 0",
                }}
            >
              <Progressbar
                  jobStatus={jobStatus}
              />
            </div>
        )}
      </div>
  );
};

export default BatchPage;
