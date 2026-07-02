import { useState, useEffect } from "react";
import type { NormalizationPreview } from "../utils/types";
import type {ProblemDetail} from "../../../shared/error-handling/types/ErrorTypes.ts";

/**
 * Rückgabewerte des useNormalizationPreview Hooks.
 *  - data: Die Normalisierungsvorschau (Methoden mit Density-URL + PCA-Daten).
 *  - isLoading: Gibt an, ob die Daten geladen werden.
 *  - error: Fehlermeldung, falls ein Fehler auftritt.
 *  - setError: Funktion zum Setzen des Fehlers.
 */
interface Result {
  data: NormalizationPreview | null;
  isLoading: boolean;
  error: ProblemDetail | Error | string | null;
  setError: (error: ProblemDetail | Error | string | null) => void;
}

/**
 * Lädt die Normalisierungsvorschau eines Jobs. Das Backend liefert pro Methode
 * die URL des Density-Plots (PNG) und die PCA-Punkte als JSON.
 */
export function useNormalizationPreview(jobId: string | null): Result {
  const [data, setData] = useState<NormalizationPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ProblemDetail | Error | string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const controller = new AbortController();

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/v1/preview/normalization/${jobId}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          setError(errorData ?? {
            title: "Too Many Requests",
            status: res.status,
            detail: "Rate limit exceeded. Please wait before retrying."
          });
          return;
        }
        const json: NormalizationPreview = await res.json();
        setData(json);
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e as ProblemDetail | Error | string);
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [jobId]);

  return { data, isLoading, error, setError };
}
