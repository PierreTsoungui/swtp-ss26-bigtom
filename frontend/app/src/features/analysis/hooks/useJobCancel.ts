import type { ApiProblemDetail, ProblemDetail } from "../../../shared/error-handling/types/ErrorTypes.ts";
import { useState } from "react";

/**
 * Provides functionality to cancel an active job.
 *
 * @param jobId - The ID of the job to be canceled.
 * @param onCancelSuccess - Callback triggered after a successful cancellation.
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
