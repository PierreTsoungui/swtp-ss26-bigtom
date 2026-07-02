import { useState } from "react";
import type {HeatMapErrorResponse, HeatMapRequest, HeatMapResponse} from "../utils/types.ts";


/**
 * Orchestrates the generation of a heatmap based on selected filters and grouping options.
 *
 * Submits a POST request to the server to initiate the calculation and manages
 * the resulting metadata, loading state, and error handling.
 *
 * @param jobId - The unique identifier of the analysis job.
 */
export const useGenerateHeatMap = (jobId: string | null) => {
    const [data, setData] = useState<HeatMapResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Triggers the server-side heatmap generation.
     * @param payload - The configuration including filters and metadata grouping.
     * @returns The server response or null if the request fails.
     */
    const generateHeatMap = async (
        payload: HeatMapRequest,
    ): Promise<HeatMapResponse | null> => {
        if (!jobId) {
            setError("Missing job id");
            return null;
        }

        try {
            setIsLoading(true);
            setError(null);

            const response = await fetch(`/api/v1/heatmap/${jobId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const body = await response.json();

            if (!response.ok) {
                const errorResponse = body as HeatMapErrorResponse;
                throw new Error(
                    errorResponse.detail ?? errorResponse.message ?? "Heatmap generation failed",
                );
            }

            const result = body as HeatMapResponse;
            setData(result);
            return result;

        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Unknown error occurred"
            );
            return null;
        } finally {
            setIsLoading(false);
        }
    };

    return {
        data,
        isLoading,
        error,
        generateHeatMap,
    };
};