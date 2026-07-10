import type { SampleSheetPreview } from "../types";

/**
 * Thin client for the batch feature's backend endpoints.
 *
 * Network access for the batch feature lives here (in `hooks/`) rather than
 * inline in components, per the frontend architecture (§7). The exchanged
 * contract types are defined in `../types`.
 */

const BASE = "/api/v1/batch";

/**
 * Fetches a read-only tabular preview of a job's canonical sample sheet.
 *
 * @param jobId - The analysis job whose sample sheet to preview.
 * @param signal - Optional abort signal to cancel the request.
 * @returns The sample-sheet preview.
 * @throws Error if the request fails (non-2xx response).
 */
export async function previewSampleSheet(
  jobId: string,
  signal?: AbortSignal,
): Promise<SampleSheetPreview> {
  const response = await fetch(`${BASE}/${jobId}/sample-sheet`, { signal });
  if (!response.ok) {
    throw new Error(`Error ${response.status}`);
  }
  return (await response.json()) as SampleSheetPreview;
}
