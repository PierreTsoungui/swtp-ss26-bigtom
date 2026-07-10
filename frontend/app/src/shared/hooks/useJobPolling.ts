import { useState, useEffect, useRef } from "react";
import type { ProblemDetail } from "../errors/ErrorTypes";
import { JobPhase, type JobStatus, JobStatusValue } from "../types/JobTypes.ts";
import { logger } from "../utils/logger";

/** Interval between two status requests, in milliseconds. */
const POLLING_INTERVAL_MS = 3000;

/** Number of consecutive request failures tolerated before the job is marked failed. */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Determines whether a job has reached a state that requires no further polling.
 *
 * A state is terminal when the job has failed, or when it is waiting for user
 * input at a decision point (normalization, batch, results), or once the heatmap
 * has been generated.
 *
 * @param phase - The current pipeline phase.
 * @param status - The current execution state.
 * @returns `true` if polling should stop.
 */
export function isTerminalState(phase: JobPhase, status: JobStatusValue): boolean {
  if (status === JobStatusValue.FAILED) {
    return true;
  }

  return (
    (phase === JobPhase.NORMALIZATION && status === JobStatusValue.WAITING) ||
    (phase === JobPhase.BATCH && status === JobStatusValue.WAITING) ||
    (phase === JobPhase.RESULTS && status === JobStatusValue.WAITING) ||
    (phase === JobPhase.HEATMAP && status === JobStatusValue.COMPLETED)
  );
}

/**
 * Custom hook that monitors a job by polling its status endpoint.
 *
 * Polls `GET /api/v1/status/:jobId` every {@link POLLING_INTERVAL_MS} and stops
 * once a terminal state is reached (see {@link isTerminalState}). On network
 * failures it retries with a linear backoff and, after
 * {@link MAX_CONSECUTIVE_FAILURES} consecutive failures, surfaces a synthetic
 * failed status so the UI can report the lost connection.
 *
 * @param jobId - The id of the job to monitor. Passing `null` disables polling.
 * @param resetKey - Optional value that, when changed, resets the polling state
 *   and the failure counter (e.g. to restart polling for a new attempt).
 * @returns The latest {@link JobStatus}, or `null` while none has been received.
 */
export function useJobPolling(jobId: string | null, resetKey?: number): JobStatus | null {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const failureCountRef = useRef<number>(0);

  // Reset the accumulated state whenever the caller bumps the reset key.
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect --
       Intentional reset: clearing the last status when the caller restarts
       polling (a new reset key) keeps stale progress from flashing in the UI. */
    setJobStatus(null);
    failureCountRef.current = 0;
  }, [resetKey]);

  useEffect(() => {
    if (!jobId) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/v1/status/${jobId}`);
        if (!response.ok) {
          throw new Error(`HTTP error: status ${response.status}`);
        }

        const status = parseJobStatus(await response.json());
        failureCountRef.current = 0;
        setJobStatus(status);

        // Continue polling until the job reaches a terminal state.
        if (!isTerminalState(status.phase, status.status) && !cancelled) {
          timeoutId = setTimeout(() => void poll(), POLLING_INTERVAL_MS);
        }
      } catch (error) {
        failureCountRef.current += 1;
        logger.warn(
          `[useJobPolling] Request failed (${failureCountRef.current}/${MAX_CONSECUTIVE_FAILURES})`,
          error,
        );

        if (failureCountRef.current >= MAX_CONSECUTIVE_FAILURES) {
          // Give up and mark the job as failed so the UI stops waiting.
          setJobStatus((previous) =>
            previous
              ? {
                  ...previous,
                  status: JobStatusValue.FAILED,
                  error: {
                    title: "Connection error",
                    status: 503,
                    detail: `Connection to the server was lost after ${MAX_CONSECUTIVE_FAILURES} attempts.`,
                    instance: `/api/v1/status/${jobId}`,
                  },
                }
              : null,
          );
        } else if (!cancelled) {
          // Linear backoff: wait longer after each consecutive failure.
          timeoutId = setTimeout(() => void poll(), POLLING_INTERVAL_MS * failureCountRef.current);
        }
      }
    };

    void poll();

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
 * Validates and converts a raw API response into a typed {@link JobStatus}.
 *
 * @param value - The parsed JSON body of a status response.
 * @returns The validated job status.
 * @throws Error if the response structure or a required field is invalid.
 */
function parseJobStatus(value: unknown): JobStatus {
  if (!isRecord(value)) {
    throw new Error("Invalid job status response: expected an object");
  }

  const { job_id, status, phase, progress_percent, current_step, error } = value;

  if (typeof job_id !== "string") {
    throw new Error("Invalid job status response: job_id");
  }
  if (!isJobStatusValue(status)) {
    throw new Error("Invalid job status response: status");
  }
  if (!isJobPhase(phase)) {
    throw new Error("Invalid job status response: phase");
  }
  if (!isFiniteNumber(progress_percent)) {
    throw new Error("Invalid job status response: progress_percent");
  }
  if (typeof current_step !== "string") {
    throw new Error("Invalid job status response: current_step");
  }

  const hasBareDetail = isRecord(error) && typeof error.detail === "string";

  return {
    job_id,
    status,
    phase,
    progress_percent,
    current_step,
    error: isProblemDetail(error)
      ? error
      : hasBareDetail
        ? ({ detail: error.detail } as ProblemDetail)
        : undefined,
  };
}

/** Type guard for the {@link JobStatusValue} union. */
function isJobStatusValue(value: unknown): value is JobStatusValue {
  return value === "running" || value === "waiting" || value === "completed" || value === "failed";
}

/** Type guard for the {@link JobPhase} union. */
function isJobPhase(value: unknown): value is JobPhase {
  return (
    value === "uploaded" ||
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

/** Type guard for a {@link ProblemDetail} conforming to RFC 9457. */
function isProblemDetail(value: unknown): value is ProblemDetail {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    Number.isInteger(value.status) &&
    typeof value.detail === "string" &&
    (value.instance === undefined || typeof value.instance === "string") &&
    (value.errors === undefined || isProblemDetailErrors(value.errors))
  );
}

/** Type guard for the field-level errors of a {@link ProblemDetail}. */
function isProblemDetailErrors(value: unknown): value is Record<string, string[]> {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (messages) =>
        Array.isArray(messages) && messages.every((message) => typeof message === "string"),
    )
  );
}

/** Type guard for a non-array object (a plain record). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type guard for a finite number. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
