import type { BatchParametersResponse } from "../types.ts";
import { logger } from "../../../shared/utils/logger";
import { useAsyncResource } from "../../../shared/hooks/useAsyncResource";

/**
 * Result of the {@link useBatchParameters} hook.
 */
interface UseBatchParametersResult {
  /** Available metadata columns and group values for batch correction. */
  parameters: BatchParametersResponse | null;
  /** Indicates if the parameter options are currently being fetched. */
  isLoading: boolean;
  /** Human-readable error message if the fetch fails. */
  error: string | null;
}

/**
 * Fetches available metadata parameters for a specific job.
 *
 * This data is used to populate dropdown selections for batch variables,
 * covariates, and group comparisons (case/control).
 *
 * @param jobId - The unique identifier of the job. Fetching is skipped if null.
 * @returns An object containing the parameters, loading state, and potential errors.
 */
export function useBatchParameters(jobId: string | null): UseBatchParametersResult {
  const { data, isLoading, error } = useAsyncResource<BatchParametersResponse>(
    async (signal) => {
      const response = await fetch(`/api/v1/batch/${jobId}/batch-options`, { signal });
      if (!response.ok) {
        throw new Error(`Failed to load batch parameters (HTTP ${response.status})`);
      }
      return (await response.json()) as BatchParametersResponse;
    },
    [jobId],
    {
      enabled: jobId != null,
      onError: (err) => logger.error("[useBatchParameters] Failed to load parameters:", err),
    },
  );

  return { parameters: data, isLoading, error };
}
