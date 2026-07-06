import type { FilteringStatsType } from "../types.ts";
import { useAsyncResource } from "../../../shared/hooks/useAsyncResource";

/**
 * Result of the {@link useFilterStats} hook.
 */
interface UseFilterStatsResult {
  /** The calculated statistics for each filtering stage. */
  filterStats: FilteringStatsType | null;
  /** Whether the statistics are currently being fetched. */
  isLoading: boolean;
  /** Human-readable error message if the fetch failed. */
  error: string | null;
}

/**
 * Fetches the filtering audit trail and statistics for a specific job.
 *
 * A `409` response means the statistics are not computed yet (expected while
 * filtering runs) and is treated as "no data", not an error.
 *
 * @param jobId - The ID of the analysis job. If null, fetching is disabled.
 * @returns The current loading state and stats once processing is complete.
 */
export function useFilterStats(jobId: string | null): UseFilterStatsResult {
  const { data, isLoading, error } = useAsyncResource<FilteringStatsType>(
    async (signal) => {
      const response = await fetch(`/api/v1/filter/${jobId}/stats`, { method: "GET", signal });
      if (!response.ok) {
        if (response.status === 409) {
          // Statistics are not ready yet; expected while filtering runs.
          return null;
        }
        throw new Error(`Request failed (${response.status}): ${response.statusText}`);
      }
      return (await response.json()) as FilteringStatsType;
    },
    [jobId],
    { enabled: jobId != null },
  );

  return { filterStats: data, isLoading, error };
}
