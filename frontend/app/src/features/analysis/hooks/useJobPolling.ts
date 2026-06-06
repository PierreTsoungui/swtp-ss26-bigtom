import { useState, useEffect, useRef } from "react";
import type { ProblemDetail } from "../../../shared/error-handling/types/ErrorTypes";
import type { JobPhase, JobStatus, JobStatusValue} from "../utils/types";

const TERMINAL_STATES: JobStatusValue[] = [
  "normalization_done",
  "ready_for_batch",
  "batch_done",
  "completed",
  "failed",
  "canceled",
  "ready_for_batch",
  "analysis_done"
];

/**
 * Custom Hook, der den Status eines Jobs überwacht, indem er regelmäßig die API abfragt.
 * @param jobId Die ID des Jobs, dessen Status überwacht werden soll. Wenn `null`, wird kein Polling durchgeführt.
 */
export function useJobPolling(jobId: string | null, resetKey? : number): JobStatus | null {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  // const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef<number>(0);
  const MAX_FAILURES = 3;

  useEffect(() => {
    setJobStatus(null);
    failCountRef.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await fetch(`/api/v1/status/${jobId}`);

        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }

        const body: unknown = await res.json();
        console.log("[RAW STATUS RESPONSE]", body);
        const data = parseJobStatus(body);
        failCountRef.current = 0; // Reset failure count on success
        setJobStatus(data);

        const isWaitingForSelection: boolean = data.status === "waiting" && data.phase === "waiting_selection";

        const shouldStop = TERMINAL_STATES.includes(data.status) || isWaitingForSelection;

        if (!shouldStop && !cancelled) {
          timeoutId = setTimeout(poll, 1500);
        }
      } catch (err) {
        failCountRef.current += 1;
        console.warn(`[POLLING] Anfrage fehlgeschlagen (${failCountRef.current}/${MAX_FAILURES})`, err);
        if (failCountRef.current >= MAX_FAILURES) {
          setJobStatus((prev) =>
              prev
                  ? {
                    ...prev,
                    status: "failed",
                    error: {
                      type: "http://localhost:3000/analysis/errors#connection-error",
                      title: "Verbindungsfehler",
                      status: 503,
                      detail: "Verbindung zum Server nach 3 Versuchen unterbrochen.",
                      instance: `/api/v1/status/${jobId}`,
                    },
                  }
                  : null
          );

        } else if (!cancelled) {
          timeoutId = setTimeout(poll, 1500 * failCountRef.current); // Exponentielles Backoff
        }
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [jobId, resetKey]);

  return jobStatus;
}

function parseJobStatus(value: unknown): JobStatus {
  if (!isRecord(value)) {
    console.error("[PARSING ERROR] Expected an object but got:", value);
    throw new Error("Invalid job status response");
  }

  const job_id = value.job_id;
  const status = value.status;
  const phase = value.phase;
  const progress_percent = value.progress_percent;
  const current_step = value.current_step;
  const steps_total = value.steps_total;
  const steps_completed = value.steps_completed;
  const estimated_seconds_remaining = value.estimated_seconds_remaining;
  const error = value.error;

  if (typeof job_id !== "string") {
    throw new Error("Invalid job status response: job_id");
  }
  if (!isJobStatusValue(status)) {
    console.error("[PARSING ERROR] Unknown status value:", status);
    throw new Error("Invalid job status response: status");
  }
  if (!isJobPhase(phase)) {
    console.error("[PARSING ERROR] Unknown phase value:", phase);
    throw new Error("Invalid job status response: phase");
  }
  if (!isFiniteNumber(progress_percent)) {
    throw new Error("Invalid job status response: progress_percent");
  }
  if (typeof current_step !== "string") {
    throw new Error("Invalid job status response: current_step");
  }
  if (!isNonNegativeInteger(steps_total)) {
    throw new Error("Invalid job status response: steps_total");
  }
  if (!isNonNegativeInteger(steps_completed)) {
    throw new Error("Invalid job status response: steps_completed");
  }

  // estimated_seconds_remaining: null oder number, undefined auch erlaubt
  const parsedEstimated: number | null =
    estimated_seconds_remaining === undefined || estimated_seconds_remaining === null
      ? null
      : isFiniteNumber(estimated_seconds_remaining)
      ? estimated_seconds_remaining
      : null;

  return {
    job_id,
    status,
    phase,
    progress_percent,
    current_step,
    steps_total,
    steps_completed,
    estimated_seconds_remaining: parsedEstimated,
    ...(isProblemDetail(error) ? { error } : {}),
  };
}

function isJobStatusValue(value: unknown): value is JobStatusValue {
  return (
    value === "queued" ||
    value === "running" ||
    value === "waiting" ||
    value === "filtering" ||
    value === "filtering_done" ||
    value === "normalization_done" ||
    value === "ready_for_batch" ||
    value === "batch_done" ||
    value == "analysis_done" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}

function isJobPhase(value: unknown): value is JobPhase {
  return (
    value === "uploaded" ||
    value === "validating" ||
    value === "converting" ||
    value === "filtering" ||
    value === "filtering_done" ||
    value === "normalization_preview" ||
    value === "waiting_selection" ||
    value === "normalizing" ||
    value === "batch_correction" ||
    value == "downstream_analysis" ||
    value === "completed" ||
    value === "reset"
  );
}


function isProblemDetail(value: unknown): value is ProblemDetail {
  if (!isRecord(value)) return false;

  return (
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    Number.isInteger(value.status) &&
    typeof value.detail === "string" &&
    typeof value.instance === "string" &&
    (value.errors === undefined || isProblemDetailErrors(value.errors))
  );
}

function isProblemDetailErrors(value: unknown): value is Record<string, string[]> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) &&
        messages.every((message) => typeof message === "string")
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}
