import fs from "node:fs";
import path from "node:path";
import { APIRequestContext, expect } from "@playwright/test";
import { Dataset } from "./dataset";

export interface JobStatus {
  job_id: string;
  status: "running" | "waiting" | "completed" | "failed";
  phase: string;
  progress_percent: number;
  current_step: string;
  error: Record<string, unknown> | null;
}

/**
 * Uploads a full dataset via multipart/form-data, exactly as the frontend does
 * (repeated `idat_files` fields + one `sample_sheet`). Returns the raw response.
 */
export async function uploadDataset(
  request: APIRequestContext,
  ds: Dataset,
  filterSettings?: object,
) {
  const form = new FormData();
  form.append(
    "sample_sheet",
    new Blob([fs.readFileSync(ds.sampleSheet)]),
    path.basename(ds.sampleSheet),
  );
  for (const f of ds.idats) {
    form.append("idat_files", new Blob([fs.readFileSync(f)]), path.basename(f));
  }
  if (filterSettings) {
    form.append("filter_settings", JSON.stringify({ filter_settings: filterSettings }));
  }
  return request.post("/api/v1/upload", { multipart: form, timeout: 300_000 });
}

/** Fetches the current job status. */
export async function getStatus(
  request: APIRequestContext,
  jobId: string,
): Promise<{ ok: boolean; status: number; body: JobStatus }> {
  const res = await request.get(`/api/v1/status/${jobId}`);
  return { ok: res.ok(), status: res.status(), body: res.ok() ? await res.json() : (await res.json()) };
}

/**
 * Polls the job status until `predicate` returns true, the job fails, or the
 * timeout elapses. Fails the test with a descriptive message on timeout/failure.
 */
export async function waitForStatus(
  request: APIRequestContext,
  jobId: string,
  predicate: (s: JobStatus) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<JobStatus> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const intervalMs = opts.intervalMs ?? 2_000;
  const label = opts.label ?? "condition";
  const deadline = Date.now() + timeoutMs;
  let last: JobStatus | null = null;

  while (Date.now() < deadline) {
    const res = await request.get(`/api/v1/status/${jobId}`);
    if (res.ok()) {
      last = (await res.json()) as JobStatus;
      if (last.status === "failed") {
        throw new Error(
          `Job ${jobId} FAILED while waiting for ${label}: phase=${last.phase} ` +
            `detail=${JSON.stringify(last.error)}`,
        );
      }
      if (predicate(last)) return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${label}. ` +
      `Last status: ${last ? `${last.phase}/${last.status} (${last.progress_percent}%)` : "none"}`,
  );
}

/** Convenience: wait until the job reaches a given (phase, status). */
export function reachedPhase(phase: string, status: JobStatus["status"]) {
  return (s: JobStatus) => s.phase === phase && s.status === status;
}

/** Asserts an RFC-9457 problem-detail body shape. */
export function expectProblemDetail(body: any, status: number) {
  // The backend nests the problem under `detail` for HTTPException-based errors
  // and returns it flat for AppException-based ones; accept either.
  const p = body?.detail && typeof body.detail === "object" ? body.detail : body;
  expect(p).toMatchObject({ status });
  expect(typeof p.title).toBe("string");
  expect(typeof p.detail).toBe("string");
}
