import type { InspectManifest, SheetPreview, CommitSelection } from "../types";

/**
 * Thin client for the upload API (inspect -> preview -> commit).
 *
 * Network access for the upload feature lives here and is used only by the
 * upload hooks; the exchanged contract types are defined in ``../types``.
 */

const BASE = "/api/v1/upload";

/** Extracts a human-readable message from an RFC-9457 problem body. */
export function problemMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const msg =
        (detail as Record<string, unknown>).detail ?? (detail as Record<string, unknown>).message;
      if (typeof msg === "string") return msg;
    }
  }
  return fallback;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    return problemMessage(await res.json(), fallback);
  } catch {
    return fallback;
  }
}

/** Upload a folder/ZIP/file selection for inspection. */
export async function inspectUpload(files: File[], signal?: AbortSignal): Promise<InspectManifest> {
  const form = new FormData();
  for (const file of files) {
    // webkitRelativePath preserves the folder layout when a directory is picked.
    form.append("files", file, file.webkitRelativePath || file.name);
  }
  const res = await fetch(`${BASE}/inspect`, { method: "POST", body: form, signal });
  if (!res.ok) throw new Error(await readError(res, "Inspection failed"));
  return res.json() as Promise<InspectManifest>;
}

/** Lazy table preview of a candidate sample sheet. */
export async function previewSheet(
  sessionId: string,
  sheetId: string,
  rows = 20,
): Promise<SheetPreview> {
  const res = await fetch(
    `${BASE}/${sessionId}/preview?sheet_id=${encodeURIComponent(sheetId)}&rows=${rows}`,
  );
  if (!res.ok) throw new Error(await readError(res, "Preview failed"));
  return res.json() as Promise<SheetPreview>;
}

/** Confirm the selection and start the pipeline. Returns the job id. */
export async function commitUpload(selection: CommitSelection): Promise<string> {
  const res = await fetch(`${BASE}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(selection),
  });
  if (!res.ok) throw new Error(await readError(res, "Could not start the analysis"));
  const body = (await res.json()) as { job_id: string };
  return body.job_id;
}

/** Discard a staging session (best-effort). */
export function discardUpload(sessionId: string): void {
  void fetch(`${BASE}/${sessionId}`, { method: "DELETE" }).catch(() => undefined);
}
