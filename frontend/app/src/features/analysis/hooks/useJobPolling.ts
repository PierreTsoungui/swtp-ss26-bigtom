// Hier wird GET /status/{jod_id} in einem Intervall von 1-2 Sekunden gepollt, um den aktuellen Status der Analyse zu erhalten.
// Jod_id wird wahrscheinlich über Context oder Props übergeben, damit der Hook in verschiedenen Komponenten genutzt werden kann.
// Polling stoppen wenn: Status "completed" oder "failed" ist, oder wenn die Komponente unmounted wird (Cleanup Funktion in useEffect).

import { useState, useEffect, useRef } from "react";
import type { JobStatus, JobStatusValue } from "../utils/types";

const TERMINAL_STATES: JobStatusValue[] = ["completed", "failed", "canceled"];

export function useJobPolling(jobId: string | null) : JobStatus | null {
  const [jobState, setJobState] = useState<JobState>({
    status: "queued",
    progressPercent: 0,
    currentStep: "Warte auf Start...",
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        const data: JobState = await res.json();
        setJobState(data);

        // Polling stoppen bei Endzustand
        if (data.status === "completed" || data.status === "failed") {
          clearInterval(intervalRef.current!);
        }
      } catch {
        setJobState((prev) => ({
          ...prev,
          status: "failed",
          error: "Verbindung zum Server unterbrochen.",
        }));
        clearInterval(intervalRef.current!);
      }
    }, 1500);

    // Cleanup wenn Komponente unmountet
    return () => clearInterval(intervalRef.current!);
  }, [jobId]);

  return jobState;
}