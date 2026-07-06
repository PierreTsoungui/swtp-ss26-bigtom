import { useCallback, useEffect, useState } from "react";

import type {
  BatchCorrectionRequest,
  BatchErrorDetail,
  BatchHistoryResponse,
  GroupSelection,
} from "../types";

const API_BASE = "/api/v1";

/**
 * Result of the {@link useBatchCorrection} hook.
 */
export interface UseBatchCorrectionResult {
  /** The full audit trail of correction rounds and SVD plots, or `null`. */
  history: BatchHistoryResponse | null;
  /** Whether the history is currently being (re)loaded. */
  loading: boolean;
  /** The most recent structured error, or `null` if the last action succeeded. */
  error: BatchErrorDetail | null;
  /** Whether a correction round is currently being submitted. */
  isSubmitting: boolean;
  /** Reloads the batch history and SVD plot list from the server. */
  fetchHistory: () => Promise<void>;
  /** Triggers a new batch correction round. */
  runBatch: (request: BatchCorrectionRequest) => Promise<void>;
  /** Skips further corrections and proceeds to differential analysis. */
  skipBatch: (groupSelection?: GroupSelection) => Promise<void>;
}

/**
 * Coerces an unknown thrown value into a {@link BatchErrorDetail}.
 *
 * The backend returns structured `{ error, message }` payloads for known
 * failures. Anything else (a network exception, a malformed body) collapses to
 * the supplied fallback so the UI always has a user-readable message.
 *
 * @param value - The caught value (a parsed error body, an `Error`, etc.).
 * @param fallback - The error detail to use when `value` is not structured.
 * @returns A well-formed {@link BatchErrorDetail}.
 */
function toBatchError(value: unknown, fallback: BatchErrorDetail): BatchErrorDetail {
  if (typeof value === "object" && value !== null && "error" in value && "message" in value) {
    return value as BatchErrorDetail;
  }
  return fallback;
}

/**
 * Orchestrates the batch effect correction workflow for a single job.
 *
 * Manages retrieval of the SVD history, execution of new correction rounds, and
 * the transition to final analysis by skipping further corrections. All network
 * access to the batch endpoints (`/batch/{job_id}`, `…/skip`, `…/history`) lives
 * here, per the frontend architecture's hook boundary.
 *
 * @param jobId - The unique identifier of the analysis job. When `undefined`,
 *   no requests are made.
 * @returns The current history, loading/submitting flags, the latest error, and
 *   the `fetchHistory`/`runBatch`/`skipBatch` actions.
 */
export function useBatchCorrection(jobId: string | undefined): UseBatchCorrectionResult {
  const [history, setHistory] = useState<BatchHistoryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<BatchErrorDetail | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchHistory = useCallback(async () => {
    if (!jobId) {
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/batch/${jobId}/history`);
      if (!res.ok) {
        throw await res.json();
      }

      setHistory((await res.json()) as BatchHistoryResponse);
      setError(null);
    } catch (err) {
      setError(
        toBatchError(err, {
          error: "UNKNOWN",
          message: "Failed to load batch history.",
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect --
       Canonical data-fetching effect: it drives loading/data/error state from an
       asynchronous request whenever the target job changes. `fetchHistory` is a
       stable `useCallback` keyed by `jobId`. */
    void fetchHistory();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fetchHistory]);

  const runBatch = useCallback(
    async (request: BatchCorrectionRequest) => {
      if (!jobId || isSubmitting) {
        return;
      }

      setIsSubmitting(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/batch/${jobId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (!res.ok) {
          setError(
            toBatchError(await res.json(), {
              error: "BATCH_FAILED",
              message: "Starting batch correction failed.",
            }),
          );
        }
      } catch {
        setError({
          error: "NETWORK_ERROR",
          message: "Connection to server failed.",
        });
      } finally {
        setIsSubmitting(false);
      }
    },
    [jobId, isSubmitting],
  );

  const skipBatch = useCallback(
    async (groupSelection?: GroupSelection) => {
      if (!jobId) {
        return;
      }

      setError(null);
      try {
        const res = await fetch(`${API_BASE}/batch/${jobId}/skip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The group selection makes Δβ deterministic (case − control). Sent
          // only when the user picked one; otherwise the backend auto-detects.
          body: groupSelection ? JSON.stringify(groupSelection) : undefined,
        });

        if (!res.ok) {
          throw await res.json();
        }
      } catch (err) {
        setError(
          toBatchError(err, {
            error: "SKIP_FAILED",
            message: "Skipping batch correction failed.",
          }),
        );
      }
    },
    [jobId],
  );

  return {
    history,
    loading,
    error,
    isSubmitting,
    fetchHistory,
    runBatch,
    skipBatch,
  };
}
