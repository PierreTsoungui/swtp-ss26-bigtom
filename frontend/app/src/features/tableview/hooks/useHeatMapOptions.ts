import { useEffect, useState } from "react";
import type {HeatMapOptionsResponse} from "../utils/types.ts";


/**
 * Hook zum Abrufen der verfügbaren Optionen für die Heatmap-Generierung, basierend auf der Job-ID.
 * Diese Optionen umfassen die Spalten, die für die Gruppierung in der Heatmap verwendet werden können.
 * @param jobId
 */
export const useHeatMapOptions = (jobId: string | null) => {
    const [data, setData] = useState<HeatMapOptionsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) {
            return;
        }

        const fetchOptions = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch(`/heatmap/${jobId}/options`);

                if (!response.ok) {
                    throw new Error("Failed to fetch heatmap options");
                }

                const result: HeatMapOptionsResponse =
                    await response.json();

                setData(result);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Unknown error occurred",
                );
            } finally {
                setIsLoading(false);
            }
        };

        fetchOptions();
    }, [jobId]);

    return {
        data,
        isLoading,
        error,
    };
};
