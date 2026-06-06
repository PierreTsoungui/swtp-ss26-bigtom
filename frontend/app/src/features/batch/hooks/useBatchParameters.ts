import { useEffect, useState } from "react";
import type {BatchParametersResponse} from "../utils/types.ts";

export function useBatchParameters(jobId: string | null) {
    const [parameters, setParameters] = useState<BatchParametersResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) {
            setIsLoading(false);
            return;
        }

        const fetchParameters = async () => {
            try {
                setIsLoading(true);
                setError(null);

                const response = await fetch(
                    `/api/v1/batch/${jobId}/batch-options`
                );

                if (!response.ok) {
                    throw new Error(
                        `Fehler beim Laden der Batch-Parameter: ${response.status}`
                    );
                }

                const data: BatchParametersResponse = await response.json();
                setParameters(data);
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : "Unbekannter Fehler";
                setError(errorMessage);
                console.error("[useBatchParameters] Fehler:", errorMessage);
            } finally {
                setIsLoading(false);
            }
        };

        fetchParameters();
    }, [jobId]);

    return {
        parameters,
        isLoading,
        error,
    };
}