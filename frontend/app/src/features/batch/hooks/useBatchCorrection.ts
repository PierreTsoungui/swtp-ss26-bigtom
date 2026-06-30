import { useState, useEffect, useCallback } from "react";

import type {
  BatchHistoryResponse,
  BatchErrorDetail,
} from "../utils/types";

export const useBatchCorrection = (
    jobId: string | undefined,
    onSkipSuccess: () => void
) => {
  void onSkipSuccess;

  const [history, setHistory] =
      useState<BatchHistoryResponse | null>(null);

  const [globalStatus, setGlobalStatus] =
      useState<string>("idle");

  const [loading, setLoading] =
      useState<boolean>(true);

  const [error, setError] =
      useState<BatchErrorDetail | null>(null);

  const [isSubmitting, setIsSubmitting] =
      useState<boolean>(false);

  const API_BASE = "/api/v1";

  const fetchHistory = useCallback(async () => {
    if (!jobId) return;

    try {
      setLoading(true);

      const res = await fetch(
          `${API_BASE}/batch/${jobId}/history`
      );

      if (!res.ok) {
        const errData: BatchErrorDetail =
            await res.json();
        throw errData;
      }

      const data: BatchHistoryResponse =
          await res.json();

      setHistory(data);
      setError(null);
    } catch (err: any) {
      setError(
          err || {
            error: "UNKNOWN",
            message: "Failed to load batch history",
          }
      );
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId) return;

    fetchHistory();
  }, [jobId, fetchHistory]);

  const runBatch = async (settings: any) => {
    if (!jobId || isSubmitting) return;

    setIsSubmitting(true);
    setGlobalStatus("running");
    setError(null);

    try {
      const res = await fetch(
          `${API_BASE}/batch/${jobId}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(settings),
          }
      );

      if (!res.ok) {
        const errData: BatchErrorDetail =
            await res.json();

        setGlobalStatus("idle");
        setError(errData);
        return;
      }
    } catch {
      setGlobalStatus("idle");

      setError({
        error: "NETWORK_ERROR",
        message: "Connection to server failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const skipBatch = async (groupSelection?: {
    group_column: string;
    case_group: string;
    control_group: string;
  }) => {
    if (!jobId) return;

    setGlobalStatus("running");
    setError(null);

    try {
      const res = await fetch(
          `${API_BASE}/batch/${jobId}/skip`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // The group selection makes Δβ deterministic (case − control). Sent
            // only when the user picked one; otherwise the backend auto-detects.
            body: groupSelection ? JSON.stringify(groupSelection) : undefined,
          }
      );

      if (!res.ok) {
        const errData: BatchErrorDetail =
            await res.json();

        setGlobalStatus("idle");
        throw errData;
      }

      onSkipSuccess();
    } catch (err: any) {
      setGlobalStatus("idle");

      setError(
          err || {
            error: "SKIP_FAILED",
            message: "Skipping batch correction failed.",
          }
      );
    }
  };

  return {
    history,
    globalStatus,
    loading,
    error,
    runBatch,
    skipBatch,
    fetchHistory,
    setError,
    isSubmitting,
  };
};