import type { ApiProblemDetail, ProblemDetail } from "../errors/ErrorTypes.ts";
import { useState } from "react";

/**
 * Return value of {@link useJobCancel}.
 */
interface UseJobCancel {
  /** Sends the cancel/delete request for the job. */
  cancelJob: () => Promise<void>;
  /** Whether a cancellation request is currently in flight. */
  isLoading: boolean;
  /** The parsed error of the last failed attempt, or `null`. */
  error: ProblemDetail | null;
}

/**
 * Custom hook that cancels a job and permanently deletes its data.
 *
 * Sends `POST /api/v1/reset/:jobId`, which stops any running work and removes the
 * job's data on the server. Network and API errors are captured as a typed
 * {@link ProblemDetail} for the caller to display.
 *
 * @param jobId - The id of the job to cancel.
 * @param onCancelSuccess - Callback invoked once the cancellation succeeds
 *   (e.g. to navigate away).
 * @returns The {@link UseJobCancel} controls and state.
 */
export function useJobCancel(jobId: string, onCancelSuccess: () => void): UseJobCancel {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ProblemDetail | null>(null);

  async function cancelJob() {
    setIsLoading(true);
    setError(null);

    try {
      const response: Response = await fetch(`/api/v1/reset/${jobId}`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiProblemDetail;
        setError(errorData.details);
        return;
      }
      onCancelSuccess();
    } catch {
      setError({
        title: "Connection Error",
        status: 503,
        detail: "The connection to the server was interrupted.",
        instance: `/api/v1/reset/${jobId}`,
      });
    } finally {
      setIsLoading(false);
    }
  }
  return { cancelJob, isLoading, error };
}
