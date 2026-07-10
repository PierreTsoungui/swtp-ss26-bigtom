import { useCallback, useState } from "react";

import type { ProblemDetail } from "@shared/errors/ErrorTypes.ts";
import type { NormalizationMethod } from "../types";

/**
 * A callback used to surface an error to the page's shared error channel.
 * Accepts the same union the page's {@link ErrorMessage} understands.
 */
type ReportError = (error: ProblemDetail | Error | string | null) => void;

/**
 * Result of the {@link useNormalizationSubmit} hook.
 */
export interface UseNormalizationSubmitResult {
  /**
   * Submits the chosen normalization method to the backend.
   * @returns `true` when the request was accepted, `false` on any error.
   */
  submitMethod: (method: NormalizationMethod) => Promise<boolean>;
  /** Whether a submission request is currently in flight. */
  isSubmitting: boolean;
}

/**
 * Starts the server-side normalization for a chosen method
 * (`POST /normalize/{job_id}`).
 *
 * Isolating this network call in a hook keeps the page component free of I/O
 * (per the frontend architecture's hook boundary). Errors are reported through
 * the supplied {@link ReportError} callback so the page can render them in its
 * single, shared error surface; the boolean return lets the page advance into
 * the polling/progress state only on success.
 *
 * @param jobId - The job to normalize. When `null`, submission is a no-op.
 * @param onError - Callback that receives a parsed error (or `null` to clear).
 * @returns The `submitMethod` action and the `isSubmitting` flag.
 */
export function useNormalizationSubmit(
  jobId: string | null,
  onError: ReportError,
): UseNormalizationSubmitResult {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitMethod = useCallback(
    async (method: NormalizationMethod): Promise<boolean> => {
      if (!jobId) {
        return false;
      }

      setIsSubmitting(true);
      onError(null);
      try {
        const res = await fetch(`/api/v1/normalize/${jobId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ method }),
        });

        if (!res.ok) {
          const problem = (await res.json().catch(() => null)) as ProblemDetail | null;
          onError(
            problem ?? {
              title: "Request failed",
              detail: `HTTP ${res.status}`,
              status: res.status,
              instance: "",
            },
          );
          return false;
        }

        return true;
      } catch (e) {
        onError(e instanceof Error ? e.message : "An unknown error occurred");
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [jobId, onError],
  );

  return { submitMethod, isSubmitting };
}
