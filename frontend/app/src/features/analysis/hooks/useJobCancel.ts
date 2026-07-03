import type { ApiProblemDetail, ProblemDetail } from "../../../shared/error-handling/types/ErrorTypes.ts";
import { useState } from "react";

/**
 * Custom Hook that provides functionality to cancel/reset a running job.
 * @param jobId The ID of the job to be canceled.
 * @param onCancelSuccess Callback function executed upon successful cancellation.
 * @returns An object containing the `cancelJob` trigger function, an `isLoading` boolean state, and an `error` state.
 */
export function useJobCancel(jobId: string, onCancelSuccess: () => void) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<ProblemDetail | null>(null);

    async function cancelJob() {
        setIsLoading(true);
        setError(null);

        try {
            const response: Response = await fetch(`/api/v1/reset/${jobId}`, {
                method: "POST",
            });

            if (!response.ok) {
                const errorData = (await response.json()) as ApiProblemDetail;
                setError(errorData.details);
                return;
            }
            onCancelSuccess();
        } catch {
            setError({
                type: "http://localhost:3000/analysis/errors#connection-error",
                title: "Connection Error",
                status: 503,
                detail: "The connection to the server was interrupted.",
                instance: `/api/v1/reset/${jobId}`,
            });
        } finally {
            setIsLoading(false);
        }
    }
    return { cancelJob, isLoading, error };
}
