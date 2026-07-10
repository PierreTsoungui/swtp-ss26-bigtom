import type { HeatMapOptionsResponse } from "../types";
import { useAsyncResource } from "@shared/hooks/useAsyncResource.ts";

/**
 * Fetches available metadata columns for heatmap grouping and annotation.
 *
 * Provides the necessary options to populate selection dropdowns for
 * primary and secondary grouping variables in the heatmap view.
 *
 * @param jobId - The unique identifier of the analysis job. Fetching is skipped
 *   when null.
 */
export const useHeatMapOptions = (jobId: string | null) =>
  useAsyncResource<HeatMapOptionsResponse>(
    async (signal) => {
      const response = await fetch(`/api/v1/heatmap/${jobId}/options`, { signal });
      if (!response.ok) {
        throw new Error("Failed to fetch heatmap options");
      }
      return (await response.json()) as HeatMapOptionsResponse;
    },
    [jobId],
    { enabled: jobId != null },
  );
