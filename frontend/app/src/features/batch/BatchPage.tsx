import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { BatchForm } from "./components/BatchForm";
import { SvdPlot } from "./components/SvdPlot";

import { useBatchParameters } from "./hooks/useBatchParameters";
import { useBatchCorrection } from "./hooks/useBatchCorrection";
import { useJobPolling } from "../analysis/hooks/useJobPolling";

import Progressbar from "../../shared/components/Progressbar";

import type { BatchFormData } from "./utils/types";

const BatchPage: React.FC = () => {
  const { job_id } = useParams<{ job_id: string }>();
  const navigate = useNavigate();

  const [showProgressBar, setShowProgressBar] = useState(false);

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
    isSubmitting,
    globalStatus,
  } = useBatchCorrection(job_id, () => {});

  // Status Polling
  const jobStatus = useJobPolling(
      showProgressBar && job_id ? job_id : null
  );

  // Erfolgreich beendet
  useEffect(() => {
    if (!jobStatus || !job_id) return;

    if (
        jobStatus.status === "batch_done" ||
        jobStatus.status === "waiting"
    ) {
      navigate(`/results/${job_id}`);
    }
  }, [jobStatus, job_id, navigate]);

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

    setShowProgressBar(true);
  };

  const handleSkip = async () => {
    await skipBatch();
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
                isLoading={
                    isSubmitting ||
                    globalStatus === "running"
                }
                onSubmit={handleSubmit}
                onSkip={handleSkip}
            />
        )}
      </div>
  );
};

export default BatchPage;