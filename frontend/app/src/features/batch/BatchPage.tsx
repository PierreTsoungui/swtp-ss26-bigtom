import { useParams } from "react-router-dom";
import React, { useEffect, useState } from "react";

import { BatchForm } from "./components/BatchForm";
import { SvdPlot } from "./components/SvdPlot";

import { useBatchParameters } from "./hooks/useBatchParameters";
import { useBatchCorrection } from "./hooks/useBatchCorrection";
import { useJobPolling } from "../analysis/hooks/useJobPolling";

import Progressbar from "../../shared/components/Progressbar";

import type { BatchFormData } from "./utils/types";
import {useNavigate} from "react-router";

const BatchPage: React.FC = () => {
  const { job_id } = useParams<{ job_id: string }>();
  const [showProgressBar, setShowProgressBar] = useState(false);
  const navigate = useNavigate();

  // Dropdown Werte
  const {
    parameters,
    isLoading: parametersLoading,
  } = useBatchParameters(job_id ?? null);

  // Batch Workflow
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

  // Status Polling
  const jobStatus = useJobPolling(
      showProgressBar && job_id ? job_id : null,
      pollingKey
  );

  const batchRunning = isSubmitting && jobStatus?.status === "running";

  // Erfolgreich beendet
  useEffect(() => {
    if (!jobStatus) return;
    console.log("[BATCH STATUS]", jobStatus);

    // DMP/DMR läuft
    if (jobStatus.phase === "downstream_analysis" && jobStatus.status === "running" ) {
      setShowProgressBar(true);
      return;
    }
    // DMP/DMR fertig
    else if (jobStatus.phase === "downstream_analysis" && jobStatus.status === "analysis_done") {
      setShowProgressBar(false);
      console.log("[DOWNSTREAM ANALYSIS FINISHED]", jobStatus.status);
      fetchHistory();
      navigate(`/results/${job_id}`);
      return;
    }
    const batch_finished = jobStatus.status === "waiting" || jobStatus.status === "batch_done"
    if (batch_finished && showProgressBar) {
      setShowProgressBar(false);
      fetchHistory();
    }

  }, [jobStatus, showProgressBar, fetchHistory, /* navigate ,*/ job_id ]);

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

  const handleSkip = async () => {
    await skipBatch();
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
        <h2>Step 3: Batch Effect Correction</h2>

        <p style={{ color: "#666" }}>
          Job ID: {job_id}
        </p>

        {isGlobalError && (
            <div
                style={{
                  padding: "15px",
                  backgroundColor: "#f8d7da",
                  color: "#721c24",
                  borderRadius: "4px",
                  marginBottom: "20px",
                }}
            >
              <strong>System Error:</strong>{" "}
              {error.message}
            </div>
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
                isLoading={batchRunning}
                onSubmit={handleSubmit}
                onSkip={handleSkip}
            />
        )}
      </div>
  );
};

export default BatchPage;