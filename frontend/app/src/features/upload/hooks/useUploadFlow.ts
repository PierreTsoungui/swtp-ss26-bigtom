import { useCallback, useMemo, useRef, useState } from "react";
import { commitUpload, discardUpload, inspectUpload } from "./uploadApi";
import type { ColumnMapping, InspectManifest, RoleKey, SampleSheetCandidate } from "../types";
import type { RoleSelection } from "../components/ColumnRoleMapper";
import { DEFAULT_FILTER_SETTINGS, type FilterSettings } from "../types";

/**
 * Current operational state of the upload process.
 */
export type UploadStatus = "idle" | "inspecting" | "review" | "committing";

const EMPTY_MAPPING: RoleSelection = {
  sentrix_id: null,
  sentrix_position: null,
  sample_group: null,
  sample_name: null,
};

const ROLE_KEYS: RoleKey[] = ["sentrix_id", "sentrix_position", "sample_group", "sample_name"];

/**
 * Initial role selection for a sheet: uses backend suggestions or defaults to empty.
 */
function prefillMapping(sheet: SampleSheetCandidate | null): RoleSelection {
  if (!sheet) return EMPTY_MAPPING;
  const sm = sheet.suggested_mapping;
  return {
    sentrix_id: sm.sentrix_id ?? null,
    sentrix_position: sm.sentrix_position ?? null,
    sample_group: sm.sample_group ?? null,
    sample_name: sm.sample_name ?? null,
  };
}

/**
 * Orchestrates the "Inspect → Review → Commit" upload workflow.
 *
 * This hook manages the lifecycle of a staging session, including file validation,
 * metadata role assignment, and final analysis submission.
 *
 * @param onStarted - Callback triggered with the new `jobId` after a successful commit.
 * @returns An object containing the current workflow state and action handlers.
 */
export function useUploadFlow(onStarted: (jobId: string) => void) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [manifest, setManifest] = useState<InspectManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [removedPairIds, setRemovedPairIds] = useState<Set<string>>(new Set());
  const [columnMapping, setColumnMapping] = useState<RoleSelection>(EMPTY_MAPPING);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>(DEFAULT_FILTER_SETTINGS);

  const filesRef = useRef<File[]>([]);
  const sessionRef = useRef<string | null>(null);

  const runInspect = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (sessionRef.current) discardUpload(sessionRef.current);

      setStatus("inspecting");
      setError(null);
      try {
        const result = await inspectUpload(files);
        filesRef.current = files;
        sessionRef.current = result.session_id;
        setManifest(result);
        setRemovedPairIds(new Set());
        setSelectedSheetId(
          result.sample_sheets.length === 1 ? (result.sample_sheets[0]?.id ?? null) : null,
        );
        setStatus("review");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Inspection failed");
        setStatus(manifest ? "review" : "idle");
      }
    },
    [manifest],
  );

  const inspect = useCallback((files: File[]) => void runInspect(files), [runInspect]);
  const addFiles = useCallback(
    (files: File[]) => void runInspect([...filesRef.current, ...files]),
    [runInspect],
  );

  const removePair = useCallback((pairId: string) => {
    setRemovedPairIds((prev) => new Set(prev).add(pairId));
  }, []);

  const reset = useCallback(() => {
    if (sessionRef.current) discardUpload(sessionRef.current);
    sessionRef.current = null;
    filesRef.current = [];
    setManifest(null);
    setError(null);
    setSelectedSheetId(null);
    setRemovedPairIds(new Set());
    setColumnMapping(EMPTY_MAPPING);
    setStatus("idle");
  }, []);

  const setRole = useCallback((role: RoleKey, value: string | null) => {
    setColumnMapping((prev) => ({ ...prev, [role]: value }));
  }, []);

  const sheets = useMemo(() => manifest?.sample_sheets ?? [], [manifest]);
  const visiblePairs = useMemo(
    () => (manifest?.idats ?? []).filter((p) => !removedPairIds.has(p.pair_id)),
    [manifest, removedPairIds],
  );
  const completePairs = useMemo(() => visiblePairs.filter((p) => p.complete), [visiblePairs]);

  const effectiveSheetId = useMemo(() => {
    if (sheets.length === 1) return sheets[0]?.id ?? null;
    if (selectedSheetId && sheets.some((s) => s.id === selectedSheetId)) return selectedSheetId;
    return null;
  }, [sheets, selectedSheetId]);

  const selectedSheet = useMemo(
    () => sheets.find((s) => s.id === effectiveSheetId) ?? null,
    [sheets, effectiveSheetId],
  );
  const mappingColumns = useMemo(() => selectedSheet?.columns ?? [], [selectedSheet]);

  const [mappingSheetId, setMappingSheetId] = useState<string | null>(null);
  if (effectiveSheetId !== mappingSheetId) {
    setMappingSheetId(effectiveSheetId);
    setColumnMapping(prefillMapping(selectedSheet));
  }
  const mappingComplete = useMemo(
    () =>
      ROLE_KEYS.every((k) => {
        const v = columnMapping[k];
        return v !== null && mappingColumns.includes(v);
      }),
    [columnMapping, mappingColumns],
  );

  const blockingError = useMemo<string | null>(() => {
    if (!manifest) return null;
    if (sheets.length === 0) return "No sample sheet detected — add a valid sample sheet file.";
    if (completePairs.length === 0) return "No complete IDAT pair (Grn + Red) found.";
    return null;
  }, [manifest, sheets, completePairs]);

  const selectionHint = useMemo<string | null>(() => {
    if (blockingError) return null;
    if (sheets.length > 1 && !effectiveSheetId) return "Select the sample sheet to use.";
    if (effectiveSheetId && !mappingComplete) {
      return "Assign all four column roles (Sentrix_ID, Sentrix_Position, Sample_Group, Sample_Name).";
    }
    return null;
  }, [blockingError, sheets, effectiveSheetId, mappingComplete]);

  const canCommit =
    status === "review" && !blockingError && effectiveSheetId !== null && mappingComplete;

  const commit = useCallback(async () => {
    if (!manifest || !effectiveSheetId || !mappingComplete) return;
    setStatus("committing");
    setError(null);
    try {
      const jobId = await commitUpload({
        session_id: manifest.session_id,
        selected_sample_sheet_id: effectiveSheetId,
        selected_pair_ids: completePairs.map((p) => p.pair_id),
        column_mapping: columnMapping as ColumnMapping,
        filter_settings: filterSettings.filter_settings,
      });
      sessionRef.current = null;
      onStarted(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the analysis");
      setStatus("review");
    }
  }, [
    manifest,
    effectiveSheetId,
    mappingComplete,
    completePairs,
    columnMapping,
    filterSettings,
    onStarted,
  ]);

  const discardOnUnmount = useCallback(() => {
    if (sessionRef.current) discardUpload(sessionRef.current);
  }, []);

  return {
    status,
    manifest,
    error,
    sheets,
    visiblePairs,
    completePairs,
    selectedSheetId: effectiveSheetId,
    blockingError,
    selectionHint,
    canCommit,
    mappingColumns,
    columnMapping,
    setRole,
    filterSettings,
    setFilterSettings,
    inspect,
    addFiles,
    removePair,
    selectSheet: setSelectedSheetId,
    commit,
    reset,
    discardOnUnmount,
  };
}
