import { useState, useEffect, useRef } from "react";
import type { ProblemDetail } from "../../../shared/error-handling/types/ErrorTypes";
import {JobPhase, type JobStatus, JobStatusValue} from "../../../shared/utils/JobTypes.ts";

/**
 * Interval for status polling in milliseconds.
 */
const POLLING_INTERVAL = 3000; // 3 seconds

/**
 * Determines if a job has reached a state that requires no further polling.
 * A state is terminal if the job failed or is waiting for user input
 * in specific phases (Normalization, Batch, Results, Heatmap).
 */
export const isTerminalState = (
    phase: JobPhase,
    status: JobStatusValue,
): boolean => {

  if (status === JobStatusValue.FAILED) {
    return true;
  }

  return (
      (phase === JobPhase.NORMALIZATION && status === JobStatusValue.WAITING) ||
      (phase === JobPhase.BATCH && status === JobStatusValue.WAITING) ||
      (phase === JobPhase.RESULTS && status === JobStatusValue.WAITING) ||
      (phase === JobPhase.HEATMAP && status == JobStatusValue.COMPLETED)
  );
};

/**
 * Monitors a job's status by polling the API at regular intervals.
 *
 * Implements exponential backoff on network failures and stops polling
 * when reaching a terminal state or a maximum failure threshold.
 *
 * @param jobId - The ID of the job to monitor. Polling is disabled if null.
 * @param resetKey - Optional key to force-reset the polling state and failure count.
 * @returns The current {@link JobStatus} or null.
 */
export function useJobPolling(jobId: string | null, resetKey? : number): JobStatus | null {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
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

        const shouldStop = isTerminalState(data.phase, data.status);

        if (!shouldStop && !cancelled) {
          timeoutId = setTimeout(poll, POLLING_INTERVAL);
        }
      } catch (err) {
        failCountRef.current += 1;
        console.warn(`[POLLING] Anfrage fehlgeschlagen (${failCountRef.current}/${MAX_FAILURES})`, err);
        if (failCountRef.current >= MAX_FAILURES) {
          setJobStatus((prev) =>
              prev
                  ? {
                    ...prev,
                    status:  JobStatusValue.FAILED,
                    error: {
                      title: "Verbindungsfehler",
                      status: 503,
                      detail: "Verbindung zum Server nach 3 Versuchen unterbrochen.",
                      instance: `/api/v1/status/${jobId}`,
                    },
                  }
                  : null
          );

        } else if (!cancelled) {
          timeoutId = setTimeout(poll, POLLING_INTERVAL * failCountRef.current); // Exponentielles Backoff
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

/**
 * Validates and transforms a raw API response into a {@link JobStatus} object.
 * @throws Error if the response structure or required fields are invalid.
 */
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

  const hasDetail = isRecord(error) && typeof error.detail === "string";
  console.log("[DETAIL - BOOLEAN]", hasDetail);

  return {
    job_id,
    status,
    phase,
    progress_percent,
    current_step,
    error: isProblemDetail(error) ? error : hasDetail ? { detail: error.detail } as ProblemDetail : undefined,
  };
}

/** Type guard for the {@link JobStatusValue} union. */
function isJobStatusValue(value: unknown): value is JobStatusValue {
  return (
      value === "running" ||
      value === "waiting" ||
      value === "completed" ||
      value === "failed"
  );
}

/** Type guard for the {@link JobPhase} union. */
function isJobPhase(value: unknown): value is JobPhase {
  return (
      value === "upload" ||
      value === "filtering" ||
      value === "normalization_preview" ||
      value === "normalization" ||
      value === "svd" ||
      value === "batch" ||
      value === "analysis" ||
      value === "results" ||
      value === "heatmap"
  );
}

/** Type guard for {@link ProblemDetail} conforming to RFC 7807. */
function isProblemDetail(value: unknown): value is ProblemDetail {
  if (!isRecord(value)) return false;

  return (
    typeof value.title === "string" &&
    Number.isInteger(value.status) &&
    typeof value.detail === "string" &&
    (value.instance === undefined || typeof value.instance === "string") &&
    (value.errors === undefined || isProblemDetailErrors(value.errors))
  );
}

/** Type guard for error details conforming to RFC 7807. */
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

/** Internal helper to check for non-array objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type guard to check if a value is a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

