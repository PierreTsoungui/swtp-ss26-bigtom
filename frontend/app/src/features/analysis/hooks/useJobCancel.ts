import type {ApiProblemDetail, ProblemDetail} from "../../../shared/error-handling/types/ErrorTypes.ts";
import {useState} from "react";

export function useJobCancel(jobId: string) {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<ProblemDetail | null>(null);

    async function cancelJob() {
        setIsLoading(true);
        setError(null);

        try {
            const response : Response = await fetch(`/api/v1/reset/${jobId}`, {
                method: "POST",
            });

            if (!response.ok) {
                const errorData : ApiProblemDetail  = await response.json();
                setError(errorData.details);
                return;
            }
        } catch {
            setError({
                type: "http://localhost:3000/analysis/errors#connection-error",
                title: "Verbindungsfehler",
                status: 503,
                detail: "Verbindung zum Server unterbrochen.",
                instance: `/api/v1/reset/${jobId}`,
            });
        } finally {
            setIsLoading(false);
        }
    }
    return { cancelJob, isLoading, error };
}