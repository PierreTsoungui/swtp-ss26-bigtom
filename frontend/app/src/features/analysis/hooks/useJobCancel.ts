import type {ApiProblemDetail, ProblemDetail} from "../../../shared/error-handling/types/ErrorTypes.ts";
import {useState} from "react";

/**
 * Custom Hook, der die Funktionalität zum Abbrechen eines Jobs bereitstellt.
 * @param jobId Die ID des Jobs, der abgebrochen werden soll.
 * @param onCancelSuccess Callback-Funktion, die nach erfolgreichem Abbrechen des Jobs aufgerufen wird.
 * @returns Ein Objekt mit der Funktion `cancelJob`, einem Ladezustand `isLoading` und einem Fehlerobjekt `error`.
 */
export function useJobCancel(jobId: string, onCancelSuccess: () => void) {
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
                const errorData = (await response.json()) as ApiProblemDetail;
                setError(errorData.details);
                return;
            }
            onCancelSuccess();
        } catch {
            setError({
                type: "/analysis/errors#connection-error",
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
