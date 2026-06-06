import { useState, useEffect } from "react";
import type { NormalizationPreview } from "../utils/types";

/**
 * Interface für die Rückgabewerte des useNormalizationPreview Hooks.
    * - data: Die Normalisierungsvorschau, wenn erfolgreich geladen, sonst null.
    * - isLoading: Gibt an, ob die Daten geladen werden.
    * - error: Fehlermeldung, falls ein Fehler auftritt.
 */
interface Result {
    data: NormalizationPreview | null;
    isLoading: boolean;
    error: string | null;
}

/**
 * Hook zur Abfrage der Normalisierungsvorschauen für einen bestimmten Job.
 * @param jobId
 */
export function useNormalizationPreview(jobId: string | null): Result {
    const [data, setData] = useState<NormalizationPreview | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) return;

        const controller = new AbortController();

        async function load() {
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/v1/preview/normalization/${jobId}`,
                    { signal: controller.signal }
                );
                if (!res.ok) throw new Error(`Fehler: ${res.status}`);
                const json: NormalizationPreview = await res.json();
                setData(json);
            } catch (e) {
                if (controller.signal.aborted) return;
                setError(e instanceof Error ? e.message : "Unbekannter Fehler");
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        }

        void load();
        return () => controller.abort();
    }, [jobId]);

    return { data, isLoading, error };
}