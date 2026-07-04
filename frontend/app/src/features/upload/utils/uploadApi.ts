import type { FilterSettings } from "./types";

/** Mirrors the backend models in app/models/upload.py. */
export interface FileEntryDto {
  /** The file name (basename) of the entry. */
  name: string;
  /** Relative path from the root of the upload (or ZIP) to this file. */
  rel_path: string;
  /** Size of the file in bytes. */
  size_bytes: number;
}

/** The four canonical roles the user assigns to raw sample-sheet columns. */
export type RoleKey = "sentrix_id" | "sentrix_position" | "sample_group" | "sample_name";

/** Best-effort pre-fill for the role dropdowns (null where not recognized). */
export interface SuggestedMapping {
  sentrix_id: string | null;
  sentrix_position: string | null;
  sample_group: string | null;
  sample_name: string | null;
}

/** A complete role → raw-column assignment, sent on commit. */
export interface ColumnMapping {
  sentrix_id: string;
  sentrix_position: string;
  sample_group: string;
  sample_name: string;
}

export interface SampleSheetCandidate {
  id: string;
  name: string;
  rel_path: string;
  size_bytes: number;
  recognized: boolean;
  recommended: boolean;
  sample_count: number | null;
  columns: string[];
  suggested_mapping: SuggestedMapping;
}

export interface IdatPair {
  pair_id: string;
  grn: FileEntryDto | null;
  red: FileEntryDto | null;
  complete: boolean;
}

export interface OtherFile {
  name: string;
  rel_path: string;
  reason: string;
}

export interface ManifestError {
  code: string;
  message: string;
}

export interface InspectManifest {
  session_id: string;
  source: "zip" | "files";
  sample_sheets: SampleSheetCandidate[];
  idats: IdatPair[];
  other_files: OtherFile[];
  errors: ManifestError[];
  expires_at: string;
}

export interface SheetPreview {
  sheet_id: string;
  columns: string[];
  rows: string[][];
  total_rows: number;
  truncated: boolean;
}

export interface CommitSelection {
  session_id: string;
  selected_sample_sheet_id: string;
  selected_pair_ids: string[];
  // Explicit role → raw-column assignment for the chosen sheet.
  column_mapping: ColumnMapping;
  // The backend FilterSettings model is the *inner* object, so we send the
  // unwrapped settings (the frontend FilterSettings type wraps them once more).
  filter_settings: FilterSettings["filter_settings"];
}

const BASE = "/api/v1/upload";

/** Extracts a human-readable message from an RFC-9457 problem body. */
export function problemMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const detail = (body as Record<string, unknown>).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const msg = (detail as Record<string, unknown>).detail ?? (detail as Record<string, unknown>).message;
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
  const res = await fetch(`${BASE}/${sessionId}/preview?sheet_id=${encodeURIComponent(sheetId)}&rows=${rows}`);
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

/** Human-readable file size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}
