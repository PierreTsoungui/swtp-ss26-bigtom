import { useState } from "react";
import type {HeatMapErrorResponse, HeatMapRequest, HeatMapResponse} from "../utils/types.ts";


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