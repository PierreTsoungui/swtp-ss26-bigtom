import { useEffect, useState } from "react";
import type { BatchParametersResponse } from "../utils/types";

export function useBatchParameters(jobId: string | null) {
    const [parameters, setParameters] = useState<BatchParametersResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) return;

        const fetchParameters = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/v1/batch/${jobId}/batch-options`);
                if (!response.ok) throw new Error("Parameter konnten nicht geladen werden");

                const data = await response.json();
                setParameters(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unbekannter Fehler");
            } finally {
                setIsLoading(false);
            }
        };

        fetchParameters();
    }, [jobId]);

    return { parameters, isLoading, error };
}