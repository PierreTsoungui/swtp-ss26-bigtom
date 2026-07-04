import { useEffect, useState } from "react";
import type {BatchParametersResponse} from "../utils/types.ts";

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
export function useBatchParameters(jobId: string | null) : UseBatchParametersResult {
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