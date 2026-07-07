import { useCallback, useEffect, useState } from "react";

import { useJobPolling } from "@shared/hooks/useJobPolling.ts";
import { JobPhase, type JobStatus, JobStatusValue } from "@shared/types/JobTypes.ts";
import type { ProblemDetail } from "@shared/errors/ErrorTypes.ts";
import type { PlotSource } from "@shared/plots";
import { useGenerateHeatMap } from "./useGenerateHeatMap";
import type { HeatMapRequest } from "../types";

/** A displayable error from any of the heatmap-generation sources. */
type HeatMapError = ProblemDetail | Error | string | null;

/**
 * Result of the {@link useHeatMapGeneration} hook.
 */
export interface UseHeatMapGenerationResult {
  /** The latest polled job status while a heatmap is being generated. */
  jobStatus: JobStatus | null;
  /** Whether the generation request (`POST /heatmap`) is in flight. */
  isGenerating: boolean;
  /** Whether the job is being polled for the generation result. */
  isPolling: boolean;
  /** The finished heatmap as a shared {@link PlotSource}, or `null`. */
  heatmapSource: PlotSource | null;
  /** The most relevant error to show, from any source, or `null`. */
  displayedError: HeatMapError;
  /** Whether the (dismissable) error banner should be visible. */
  showError: boolean;
  /** Hides the error banner. */
  dismissError: () => void;
  /** Starts a new heatmap generation for the given request. */
  generate: (request: HeatMapRequest) => Promise<void>;
}

/**
 * Owns the full heatmap **generation lifecycle** for a job: firing the request,
 * polling until the server-side render finishes, exposing the resulting image,
 * and consolidating the several possible error sources into one banner.
 *
 * Encapsulating this here (rather than in the component) keeps the `HeatMap`
 * component presentational — it only renders form controls and this hook's
 * output — in line with the architecture's rule that async orchestration lives
 * in hooks, not components.
 *
 * @param jobId - The job to generate a heatmap for; `null` disables everything.
 * @returns The generation state plus the `generate`/`dismissError` actions.
 */
export function useHeatMapGeneration(jobId: string | null): UseHeatMapGenerationResult {
  const [isPolling, setIsPolling] = useState(false);
  // Bumped on each request so polling restarts cleanly for the new attempt.
  const [pollingKey, setPollingKey] = useState(0);
  const [heatmapImageURL, setHeatmapImageURL] = useState<string | null>(null);
  const [persistentError, setPersistentError] = useState<HeatMapError>(null);
  const [showError, setShowError] = useState(false);

  const jobStatus = useJobPolling(isPolling ? jobId : null, pollingKey);
  const { isLoading: isGenerating, error, generateHeatMap } = useGenerateHeatMap(jobId);

  const backendHeatmapError =
    jobStatus?.phase === JobPhase.HEATMAP && jobStatus.status === JobStatusValue.FAILED
      ? jobStatus.error
      : null;

  /* eslint-disable react-hooks/set-state-in-effect --
     These effects synchronize local state with the external polling system: a
     failed poll is latched into a persistent error, and any error source raises
     the (dismissable) banner. */
  useEffect(() => {
    if (jobStatus?.status === JobStatusValue.FAILED && jobStatus.error) {
      setPersistentError(jobStatus.error);
    }
  }, [jobStatus]);

  useEffect(() => {
    if (error || persistentError || backendHeatmapError) {
      setShowError(true);
    }
  }, [error, persistentError, backendHeatmapError]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const displayedError: HeatMapError = error ?? persistentError ?? backendHeatmapError ?? null;

  const heatmapSource: PlotSource | null = heatmapImageURL
    ? {
        pngUrl: heatmapImageURL,
        pdfUrl: `/api/v1/heatmap/${jobId}?format=pdf`,
        title: "Heatmap",
        downloadName: `heatmap_${jobId ?? "export"}`,
      }
    : null;

  useEffect(() => {
    if (!jobStatus) return;

    const isDone =
      (jobStatus.status === JobStatusValue.COMPLETED && jobStatus.phase === JobPhase.HEATMAP) ||
      (jobStatus.status === JobStatusValue.WAITING && jobStatus.phase === JobPhase.RESULTS);

    const isFailed =
      jobStatus.phase === JobPhase.HEATMAP && jobStatus.status === JobStatusValue.FAILED;

    // Reacting to the external polling system: stop polling on a terminal state
    // and, on success, point the viewer at the freshly rendered image.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isDone) {
      setIsPolling(false);
      setHeatmapImageURL(`/api/v1/heatmap/${jobId}?t=${Date.now()}`);
    }
    if (isFailed) {
      setIsPolling(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus?.status, jobStatus?.phase]);

  const generate = useCallback(
    async (request: HeatMapRequest) => {
      setHeatmapImageURL(null);
      setPersistentError(null);
      setShowError(false);
      setPollingKey((prev) => prev + 1);
      setIsPolling(true);
      await generateHeatMap(request);
    },
    [generateHeatMap],
  );

  const dismissError = useCallback(() => setShowError(false), []);

  return {
    jobStatus,
    isGenerating,
    isPolling,
    heatmapSource,
    displayedError,
    showError,
    dismissError,
    generate,
  };
}
