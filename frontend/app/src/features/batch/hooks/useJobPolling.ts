import { useState, useEffect, useRef } from "react";
import type { ProblemDetail } from "../../../shared/error-handling/types/ErrorTypes";
import type { FilterStats, JobPhase, JobStatus, JobStatusValue } from "../utils/types";

const TERMINAL_STATES: JobStatusValue[] = [
  "normalization_done",
  "ready_for_batch",
  "batch_done",
  "completed",
  "failed",
  "canceled",
  "filtering_done",
];

/**
 * Custom Hook, der den Status eines Jobs überwacht, indem er regelmäßig die API abfragt.
 * @param jobId Die ID des Jobs, dessen Status überwacht werden soll. Wenn `null`, wird kein Polling durchgeführt.
 */
export function useJobPolling(jobId: string | null): JobStatus | null {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/status/${jobId}`);
        const body: unknown = await res.json();
        const data = parseJobStatus(body);
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

function parseJobStatus(value: unknown): JobStatus {
  if (!isRecord(value)) {
    throw new Error("Invalid job status response");
  }

  const {
    job_id,
    status,
    phase,
    progress_percent,
    current_step,
    steps_total,
    steps_completed,
    filter_stats,
    estimated_seconds_remaining,
    error,
  } = value;

  if (
    typeof job_id !== "string" ||
    !isJobStatusValue(status) ||
    !isJobPhase(phase) ||
    !isFiniteNumber(progress_percent) ||
    typeof current_step !== "string" ||
    !isNonNegativeInteger(steps_total) ||
    !isNonNegativeInteger(steps_completed) ||
    !isFilterStatsOrNull(filter_stats) ||
    !isNullableNonNegativeNumber(estimated_seconds_remaining)
  ) {
    throw new Error("Invalid job status response");
  }

  return {
    job_id,
    status,
    phase,
    progress_percent,
    current_step,
    steps_total,
    steps_completed,
    filter_stats,
    estimated_seconds_remaining,
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
    value === "completed" ||
    value === "reset"
  );
}

function isFilterStatsOrNull(value: unknown): value is FilterStats | null {
  if (value === null) return true;
  if (!isRecord(value) || !Array.isArray(value.steps)) return false;

  return (
    isNonNegativeNumber(value.total_before) &&
    value.steps.every(isFilterStep) &&
    isNonNegativeNumber(value.remaining)
  );
}

function isFilterStep(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    isNonNegativeNumber(value.removed)
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

function isNonNegativeNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isNullableNonNegativeNumber(value: unknown): value is number | null {
  return value === null || isNonNegativeNumber(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}
