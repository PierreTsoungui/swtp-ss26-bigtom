import type { FilterSettings } from "./filters";

/**
 * Contract model for the folder/ZIP upload flow (inspect -> review -> commit).
 * These types mirror the backend models in ``app/models/upload.py`` and are the
 * shapes exchanged with the upload API (see ``hooks/uploadApi.ts``).
 */

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

/** A complete role -> raw-column assignment, sent on commit. */
export interface ColumnMapping {
  sentrix_id: string;
  sentrix_position: string;
  sample_group: string;
  sample_name: string;
}

/**
 * A candidate sample sheet (CSV/Excel) detected in the upload, together with the
 * metadata needed to review and choose it.
 */
export interface SampleSheetCandidate {
  /** Stable id assigned by the backend for this candidate. */
  id: string;
  /** File name (basename) of the sheet. */
  name: string;
  /** Relative path from the upload root to the sheet. */
  rel_path: string;
  /** Size of the sheet file in bytes. */
  size_bytes: number;
  /** Whether the file was recognized as a valid sample sheet. */
  recognized: boolean;
  /** Whether the backend recommends this sheet as the default choice. */
  recommended: boolean;
  /** Number of samples listed, or `null` if it could not be determined. */
  sample_count: number | null;
  /** Column headers present in the sheet. */
  columns: string[];
  /** Best-effort pre-fill for the role dropdowns. */
  suggested_mapping: SuggestedMapping;
}

/**
 * A pair of IDAT files (one per colour channel) belonging to a single sample.
 */
export interface IdatPair {
  /** Identifier derived from the shared Sentrix basename of the pair. */
  pair_id: string;
  /** The Green-channel file, or `null` if it is missing. */
  grn: FileEntryDto | null;
  /** The Red-channel file, or `null` if it is missing. */
  red: FileEntryDto | null;
  /** `true` when both channels are present (the pair is usable). */
  complete: boolean;
}

/**
 * A detected file that was excluded from the analysis, with the reason why.
 */
export interface OtherFile {
  /** File name (basename). */
  name: string;
  /** Relative path from the upload root. */
  rel_path: string;
  /** Human-readable reason the file was ignored. */
  reason: string;
}

/**
 * A non-fatal issue reported while inspecting the upload.
 */
export interface ManifestError {
  /** Short machine-readable error code. */
  code: string;
  /** Human-readable description of the issue. */
  message: string;
}

/**
 * The result of inspecting an upload: the classified manifest of everything the
 * backend found, keyed by a staging `session_id` that later commits reference.
 */
export interface InspectManifest {
  /** Id of the staging session that holds the uploaded files server-side. */
  session_id: string;
  /** Whether the upload arrived as a ZIP archive or as individual files. */
  source: "zip" | "files";
  /** All sample-sheet candidates found. */
  sample_sheets: SampleSheetCandidate[];
  /** All IDAT pairs found (complete and incomplete). */
  idats: IdatPair[];
  /** Files detected but excluded from the analysis. */
  other_files: OtherFile[];
  /** Non-fatal issues encountered during inspection. */
  errors: ManifestError[];
  /** ISO timestamp after which the staging session is discarded. */
  expires_at: string;
}

/**
 * A truncated tabular preview of a sample sheet's contents.
 */
export interface SheetPreview {
  /** Id of the previewed sheet. */
  sheet_id: string;
  /** Column headers. */
  columns: string[];
  /** Row values, aligned to {@link SheetPreview.columns}. */
  rows: string[][];
  /** Total number of rows in the full sheet. */
  total_rows: number;
  /** `true` if `rows` was capped and does not contain every row. */
  truncated: boolean;
}

/**
 * The final selection sent when confirming an upload, which starts the pipeline.
 */
export interface CommitSelection {
  /** Staging session to commit. */
  session_id: string;
  /** Id of the sample sheet chosen for the analysis. */
  selected_sample_sheet_id: string;
  /** Ids of the IDAT pairs to include. */
  selected_pair_ids: string[];
  /** Explicit role -> raw-column assignment for the chosen sheet. */
  column_mapping: ColumnMapping;
  /**
   * The backend FilterSettings model is the *inner* object, so we send the
   * unwrapped settings (the frontend FilterSettings type wraps them once more).
   */
  filter_settings: FilterSettings["filter_settings"];
}
