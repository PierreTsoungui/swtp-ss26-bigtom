import type { NormalizationPreview } from "../types";
import { ProblemError, type ProblemDetail } from "@shared/errors/ErrorTypes.ts";
import { useAsyncResource } from "@shared/hooks/useAsyncResource.ts";

/** The error shapes the normalization preview can surface. */
type PreviewError = ProblemDetail | Error | string;

/**
 * Result of the {@link useNormalizationPreview} hook.
 */
interface Result {
  /** The normalization preview containing plot URLs and PCA datasets. */
  data: NormalizationPreview | null;
  /** Indicates if the data is currently being fetched. */
  isLoading: boolean;
  /** Error details conforming to {@link ProblemDetail}, an Error object, or a string. */
  error: PreviewError | null;
  /** Function to manually update or clear the error state. */
  setError: (error: PreviewError | null) => void;
}

/**
 * Fetches normalization previews for a specific job.
 *
 * Retrieves static density plot URLs and dynamic PCA JSON data for each
 * supported normalization method to allow for comparative visualization. On a
 * non-OK response the parsed RFC-9457 problem detail (or a rate-limit fallback)
 * is surfaced as the error.
 *
 * @param jobId - The unique identifier of the job. Fetching is skipped if null.
 */
export function useNormalizationPreview(jobId: string | null): Result {
  return useAsyncResource<NormalizationPreview, PreviewError>(
    async (signal) => {
      const res = await fetch(`/api/v1/preview/normalization/${jobId}`, { signal });
      if (!res.ok) {
        const problem = (await res.json().catch(() => null)) as ProblemDetail | null;
        throw new ProblemError(
          problem ?? {
            title: "Too Many Requests",
            status: res.status,
            detail: "Rate limit exceeded. Please wait before retrying.",
            instance: "",
          },
        );
      }
      return (await res.json()) as NormalizationPreview;
    },
    [jobId],
    {
      enabled: jobId != null,
      mapError: (e) => (e instanceof ProblemError ? e.problem : (e as PreviewError)),
    },
  );
}
