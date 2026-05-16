import { useEffect, useState } from "react";
import type {
  FilterStats,
  FilteringStatsType,
  FilteringStatsResponse,
  FilteringStatsStatus, JobStatus,
} from "../utils/types";

interface UseFilteringStatsResult {
  data: FilteringStatsType | null;
  isLoading: boolean;
  error: string | null;
}

const INVALID_RESPONSE_MESSAGE =
  "Die Filterstatistik konnte nicht verarbeitet werden.";

export function useFilteringStats(
  jobStatus: JobStatus | null
): UseFilteringStatsResult {
  const [data, setData] = useState<FilteringStatsType | null>(null);
  //const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // const shouldLoad = status === "filtering_done" && Boolean(jobId);

  useEffect(() => {
    if (!jobStatus?.filter_stats) {
      setData(null);
      return;
    }

    try {
      const parsed = parseFilteringStats(jobStatus.filter_stats);
      if (!parsed) {
        setError("Filterstatistik konnte nicht verarbeitet werden");
        return;
      }
      setData(parsed);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
      setData(null);
    }
  }, [jobStatus?.filter_stats]);

  return {
    data,
    isLoading: false,  // Nicht mehr nötig, da aus jobStatus kommt
    error,
  };
  /*useEffect(() => {
    if (!shouldLoad || !jobId) return;

    const controller = new AbortController();
    const requestedJobId = jobId;

    async function loadFilteringStats() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/v1/filter/${encodeURIComponent(requestedJobId)}/stats`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API-Fehler (${response.status})`);
        }

        const body: unknown = await response.json();
        const parsed = parseFilteringStatsResponse(body);

        if (!parsed.filterStats) {
          throw new Error(parsed.error ?? INVALID_RESPONSE_MESSAGE);
        }

        setData(parsed.filterStats);
      } catch (caughtError) {
        if (controller.signal.aborted) return;

        if (shouldUseMockFallback()) {
          const fallback = parseFilteringStatsResponse(filteringStatsMock);
          setData(fallback.filterStats ?? null);
          setError(null);
          return;
        }

        setData(null);
        setError(toErrorMessage(caughtError));
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadFilteringStats();

    return () => controller.abort();
  }, [jobId, shouldLoad]);

  return {
    data: shouldLoad ? data : null,
    isLoading: shouldLoad ? isLoading : false,
    error: shouldLoad ? error : null,
  };
}*/
}

export function parseFilteringStatsResponse(value: unknown): FilteringStatsResponse {
  const directFilterStats = parseFilteringStats(value);

  if (directFilterStats) {
    return { status: "filtering_done", filterStats: directFilterStats };
  }

  if (!isRecord(value)) {
    return { status: "error", error: INVALID_RESPONSE_MESSAGE };
  }

  const status = value.status;
  if (!isFilteringStatsStatus(status)) {
    return { status: "error", error: INVALID_RESPONSE_MESSAGE };
  }

  if (status === "error") {
    return {
      status,
      error: typeof value.error === "string" ? value.error : INVALID_RESPONSE_MESSAGE,
    };
  }

  if (status !== "filtering_done") {
    return { status };
  }

  const filterStats = parseFilteringStats(value.filterStats);

  if (!filterStats) {
    return { status: "error", error: INVALID_RESPONSE_MESSAGE };
  }

  return { status, filterStats };
}

function parseFilteringStats(value: unknown): FilteringStatsType | null {
  if (isFilteringStats(value)) {
    return value;
  }

  if (isBackendFilterStats(value)) {
    return convertBackendFilterStats(value);
  }

  return null;
}

function isFilteringStats(value: unknown): value is FilteringStatsType {
  if (!isRecord(value) || !Array.isArray(value.steps)) return false;

  return (
    value.steps.length > 0 &&
    value.steps.every(isFilteringStep) &&
    isValidNumber(value.finalProbeCount)
  );
}

function isBackendFilterStats(value: unknown): value is FilterStats {
  if (!isRecord(value) || !Array.isArray(value.steps)) return false;

  return (
    isValidNumber(value.total_before) &&
    value.steps.length > 0 &&
    value.steps.every(isBackendFilterStep) &&
    isValidNumber(value.remaining)
  );
}

function isFilteringStep(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isValidNumber(value.probesBefore) &&
    isValidNumber(value.removed) &&
    isValidNumber(value.probesAfter)
  );
}

function isBackendFilterStep(value: unknown): boolean {
  if (!isRecord(value)) return false;

  return (
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    isValidNumber(value.removed)
  );
}

export function convertBackendFilterStats(stats: FilterStats): FilteringStatsType {
  let probesBefore = stats.total_before;

  const steps = stats.steps.map((step) => {
    const probesAfter = Math.max(probesBefore - step.removed, 0);
    const convertedStep = {
      name: step.name,
      probesBefore,
      removed: step.removed,
      probesAfter,
    };

    probesBefore = probesAfter;
    return convertedStep;
  });

  return {
    steps,
    finalProbeCount: stats.remaining,
  };
}

function isFilteringStatsStatus(value: unknown): value is FilteringStatsStatus {
  return (
    value === "idle" ||
    value === "filtering" ||
    value === "filtering_done" ||
    value === "error"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/*function shouldUseMockFallback(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_FILTERING_STATS_MOCK === "true";
}*/

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Die Filterstatistik konnte nicht geladen werden.";
}
