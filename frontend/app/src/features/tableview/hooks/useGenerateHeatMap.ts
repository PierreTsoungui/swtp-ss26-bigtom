import { useState } from "react";
import type { HeatMapRequest, HeatMapResponse } from "../utils/types.ts";
import { readApiError } from "../../../shared/utils/apiError.ts";


/**
 * Hook für die Generierung einer Heatmap basierend auf den ausgewählten Gruppierungsoptionen.
 * Sendet eine POST-Anfrage an den Endpoint /heatmap/{job_id} mit den entsprechenden Parametern und verwaltet den Lade- und Fehlerstatus.
 * @param jobId
 */
export const useGenerateHeatMap = (jobId: string | null) => {
    const [data, setData] = useState<HeatMapResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

            // Read the error body defensively: a server fault may return a
            // non-JSON body, so we must not blindly call response.json() before
            // confirming success (that is what produced the opaque
            // "JSON.parse: unexpected character" error users reported).
            if (!response.ok) {
                throw new Error(await readApiError(response, "Heatmap generation failed"));
            }

            const result = (await response.json()) as HeatMapResponse;
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