import { useState, useEffect } from "react";
import type { NormalizationPreview } from "../utils/types";
import type {ProblemDetail} from "../../../shared/error-handling/types/ErrorTypes.ts";

/**
 * Result of the {@link useNormalizationPreview} hook.
 */
interface Result {
  /** The normalization preview containing plot URLs and PCA datasets. */
  data: NormalizationPreview | null;
  /** Indicates if the data is currently being fetched. */
  isLoading: boolean;
  /** Error details conforming to {@link ProblemDetail}, an Error object, or a string. */
  error: ProblemDetail | Error | string | null;
  /** Function to manually update or clear the error state. */
  setError: (error: ProblemDetail | Error | string | null) => void;
}

/**
 * Fetches normalization previews for a specific job.
 *
 * Retrieves static density plot URLs and dynamic PCA JSON data for each
 * supported normalization method to allow for comparative visualization.
 *
 * @param jobId - The unique identifier of the job. Fetching is skipped if null.
 */
export function useNormalizationPreview(jobId: string | null): Result {
  const [data, setData] = useState<NormalizationPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ProblemDetail | Error | string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/preview/normalization/${jobId}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          setError(errorData ?? {
            title: "Too Many Requests",
            status: res.status,
            detail: "Rate limit exceeded. Please wait before retrying."
          });
          return;
        }
        const json: NormalizationPreview = await res.json();
        setData(json);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e as ProblemDetail | Error | string);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [jobId]);

  return { data, isLoading, error, setError };
}
