import { useParams } from "react-router-dom";
import React, { useEffect, useState } from "react";
import { BatchForm } from "./components/BatchForm";
import { SvdPlot } from "./components/SvdPlot";
import { useBatchParameters } from "./hooks/useBatchParameters";
import { useBatchCorrection } from "./hooks/useBatchCorrection";
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

  /** Polls the backend when a correction or downstream analysis is active. */
  const jobStatus = useJobPolling(
      showProgressBar && job_id ? job_id : null,
      pollingKey
  );
  const batchRunning = isSubmitting && jobStatus?.status === JobStatusValue.RUNNING;

  // Erfolgreich beendet
  useEffect(() => {
    if (!jobStatus) return;
    console.log("[BATCH STATUS]", jobStatus);

    // DMP/DMR läuft
    if (jobStatus.phase === JobPhase.ANALYSIS && jobStatus.status === JobStatusValue.RUNNING ) {
      setShowProgressBar(true);
      return;
    }
    // DMP/DMR fertig
    else if (jobStatus.phase === JobPhase.ANALYSIS && jobStatus.status === JobStatusValue.COMPLETED ||
             jobStatus.phase === JobPhase.RESULTS && jobStatus.status === JobStatusValue.WAITING
    ) {
      setShowProgressBar(false);
      console.log("[DOWNSTREAM ANALYSIS FINISHED]", jobStatus.status);
      fetchHistory();
      navigate(`/results/${job_id}`);
      return;
    }
    const batchFinished = jobStatus.phase === JobPhase.BATCH && jobStatus.status === JobStatusValue.WAITING;
    if (batchFinished && showProgressBar) {
      setShowProgressBar(false);
      fetchHistory();
      return;
    }

  }, [jobStatus, showProgressBar, fetchHistory, navigate , job_id ]);

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
    await runBatch({
      batch_correction: {
        batch_variable: data.batch_variable,
        covariates: data.covariates,
      },
    });
    setPollingKey(prev => prev + 1); // Reset Polling
    setShowProgressBar(true);
  };

  const handleSkip = async (selection?: GroupSelection) => {
    await skipBatch(selection);
    setPollingKey(prev => prev + 1); // Reset Polling
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
