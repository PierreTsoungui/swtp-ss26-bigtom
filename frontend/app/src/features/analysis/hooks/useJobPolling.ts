import { useState, useEffect, useRef } from "react";
import type { JobStatus, JobStatusValue } from "../utils/types";

const TERMINAL_STATES: JobStatusValue[] = ["completed", "failed", "canceled", "filtering_done"];

export function useJobPolling(jobId: string | null): JobStatus | null {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;
    console.log(`[POLLING] Starting job polling for job ID: ${jobId}`);
    console.log(`[POLLING] Initial job status: ${JSON.stringify(jobStatus)}`);

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/status/${jobId}`);
        const data: JobStatus = await res.json();
        setJobStatus(data);

        const isWaitingForSelection =
          data.status === "waiting" && data.phase === "waiting_selection";

        if (TERMINAL_STATES.includes(data.status) || isWaitingForSelection) {
          clearInterval(intervalRef.current!);
        }
      } catch {
        setJobStatus((prev) =>
          prev
            ? {
                ...prev,
                status: "failed",
                error: {
                  type: "http://localhost:3000/analysis/errors#connection-error",
                  title: "Verbindungsfehler",
                  status: 503,
                  detail: "Verbindung zum Server unterbrochen.",
                  instance: `/api/v1/status/${jobId}`,
                },
              }
            : null
        );
        clearInterval(intervalRef.current!);
      }
    }, 1500);

    return () => clearInterval(intervalRef.current!);
  }, [jobId]);

  return jobStatus;
}