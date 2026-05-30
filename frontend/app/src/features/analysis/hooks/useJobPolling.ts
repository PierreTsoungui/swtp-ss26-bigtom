import { useState, useEffect, useRef } from "react";
import type { ProblemDetail } from "../../../shared/error-handling/types/ErrorTypes";
import type {FilteringStatsType, JobPhase, JobStatus, JobStatusValue} from "../utils/types";

const TERMINAL_STATES: JobStatusValue[] = [
  "normalization_done",
  "ready_for_batch",
  "batch_done",
  "completed",
  "failed",
  "canceled",
];

/**
 * Custom Hook, der den Status eines Jobs überwacht, indem er regelmäßig die API abfragt.
 * @param jobId Die ID des Jobs, dessen Status überwacht werden soll. Wenn `null`, wird kein Polling durchgeführt.
 */
export function useJobPolling(jobId: string | null): JobStatus | null {
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  // const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const failCountRef = useRef<number>(0);
  const MAX_FAILURES = 3;

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
  }, [jobId]);

  return jobStatus;
}

function parseJobStatus(value: unknown): JobStatus {
  if (!isRecord(value)) {
    console.error("[PARSING ERROR] (parseJobStatus) Expected an object but got:", value);
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
    console.error("[PARSING ERROR] (parseJobStatus) Invalid field types in response:", value);
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

function isFilterStatsOrNull(value: unknown): value is FilteringStatsType | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  console.log("[FILTER_STATS]", value);
  console.log("[FILTER_STEPS]", value.steps);
  // Prüfe die Hauptfelder, die immer vorhanden sein müssen
  const hasTotalStart = isNonNegativeNumber(value.total_start);
  const hasTotalEnd = isNonNegativeNumber(value.total_end);
  const hasTotalRemoved = isNonNegativeNumber(value.total_removed);

  // Optional: Prüfe, dass die Unterobjekte existieren (aber nicht zwingend ihre Werte)
  const hasBeadCount = isRecord(value.bead_count);
  const hasDetP = isRecord(value.det_p);
  const hasMultiHit = isRecord(value.multi_hit);
  const hasNonCpg = isRecord(value.non_cpg);
  const hasSnp = isRecord(value.snp);
  const hasXy = isRecord(value.xy_chromosomes);
  const hasSampleQuality = isRecord(value.sample_quality);

  return hasTotalStart && hasTotalEnd && hasTotalRemoved &&
      hasBeadCount && hasDetP && hasMultiHit &&
      hasNonCpg && hasSnp && hasXy && hasSampleQuality;
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
