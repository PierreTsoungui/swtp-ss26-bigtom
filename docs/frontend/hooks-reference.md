# Frontend Hooks Reference

**Scope:** `frontend/app/src/shared/hooks/` and `frontend/app/src/features/*/hooks/`
**Audience:** Frontend developers, reviewers, and new team members
**Status:** Draft
**Last reviewed:** 2026-07-08

## Purpose

This document is the reference for project-specific React hooks in the frontend. It explains what each hook owns, which backend route it depends on, how it handles loading and errors, and which components consume it. Built-in React hooks such as `useState`, `useEffect`, and `useMemo` are intentionally out of scope.

## Scope

Covered source areas:

- `frontend/app/src/shared/hooks/`
- `frontend/app/src/features/upload/hooks/`
- `frontend/app/src/features/analysis/hooks/`
- `frontend/app/src/features/normalization/hooks/`
- `frontend/app/src/features/batch/hooks/`
- `frontend/app/src/features/results/hooks/`

The current code contains 15 project-specific custom hooks. The checklist-required hooks are present: `useJobPolling`, `useJobCancel`, `useFilterStats`, `useUploadFlow`, `useTableData`, `useTableFilters`, `useTableState`, `useGenerateHeatMap`, `useHeatMapOptions`, `useNormalizationPreview`, `useBatchCorrection`, and `useBatchParameters`.

## Concepts and Contract

The frontend has no global state store. State is local to pages and components, with workflow and network orchestration extracted into feature hooks. Shared cross-feature hooks live in `frontend/app/src/shared/hooks/`; feature-specific hooks live under their owning feature.

Read-only fetch hooks commonly use `useAsyncResource`, which provides a consistent `data`, `isLoading`, `error`, and cleanup contract. Mutating workflows use dedicated hooks or hook modules because their behavior is workflow-specific.

Endpoint dependencies:

| Hook or helper                      | Backend route dependency                                                              | Method        |
|-------------------------------------|---------------------------------------------------------------------------------------|---------------|
| `useJobPolling`                     | `/api/v1/status/{jobId}`                                                              | `GET`         |
| `useJobCancel`                      | `/api/v1/reset/{jobId}`                                                               | `POST`        |
| `useUploadFlow` via `inspectUpload` | `/api/v1/upload/inspect`                                                              | `POST`        |
| `useUploadFlow` via `commitUpload`  | `/api/v1/upload/commit`                                                               | `POST`        |
| `useUploadFlow` via `discardUpload` | `/api/v1/upload/{sessionId}`                                                          | `DELETE`      |
| `useFilterStats`                    | `/api/v1/filter/{jobId}/stats`                                                        | `GET`         |
| `useNormalizationPreview`           | `/api/v1/preview/normalization/{jobId}`                                               | `GET`         |
| `useNormalizationSubmit`            | `/api/v1/normalize/{jobId}`                                                           | `POST`        |
| `useBatchParameters`                | `/api/v1/batch/{jobId}/batch-options`                                                 | `GET`         |
| `useBatchCorrection.fetchHistory`   | `/api/v1/batch/{jobId}/history`                                                       | `GET`         |
| `useBatchCorrection.runBatch`       | `/api/v1/batch/{jobId}`                                                               | `POST`        |
| `useBatchCorrection.skipBatch`      | `/api/v1/batch/{jobId}/skip`                                                          | `POST`        |
| `useTableData`                      | `/api/v1/table/{jobId}/{table}`                                                       | `GET`         |
| `exportTableCsv` helper             | `/api/v1/table/{jobId}/{table}/export`                                                | `GET`         |
| `useHeatMapOptions`                 | `/api/v1/heatmap/{jobId}/options`                                                     | `GET`         |
| `useGenerateHeatMap`                | `/api/v1/heatmap/{jobId}`                                                             | `POST`        |
| `useHeatMapGeneration`              | Uses `useGenerateHeatMap` and `useJobPolling`; image URL is `/api/v1/heatmap/{jobId}` | `POST`, `GET` |

## Reference

### Hook Inventory

| Hook                      | Source path                                                                | Related tests                                                                   |
|---------------------------|----------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `useAsyncResource`        | `frontend/app/src/shared/hooks/useAsyncResource.ts`                        | `frontend/app/src/shared/hooks/useAsyncResource.test.ts`                        |
| `useJobPolling`           | `frontend/app/src/shared/hooks/useJobPolling.ts`                           | `frontend/app/src/shared/hooks/useJobPolling.test.ts`                           |
| `useJobCancel`            | `frontend/app/src/shared/hooks/useJobCancel.ts`                            | `frontend/app/src/shared/hooks/useJobCancel.test.ts`                            |
| `useUploadFlow`           | `frontend/app/src/features/upload/hooks/useUploadFlow.ts`                  | `frontend/app/src/features/upload/hooks/useUploadFlow.test.ts`                  |
| `useFilterStats`          | `frontend/app/src/features/analysis/hooks/useFilterStats.ts`               | `frontend/app/src/features/analysis/hooks/useFilterStats.test.ts`               |
| `useNormalizationPreview` | `frontend/app/src/features/normalization/hooks/useNormalizationPreview.ts` | `frontend/app/src/features/normalization/hooks/useNormalizationPreview.test.ts` |
| `useNormalizationSubmit`  | `frontend/app/src/features/normalization/hooks/useNormalizationSubmit.ts`  | `frontend/app/src/features/normalization/hooks/useNormalizationSubmit.test.ts`  |
| `useBatchParameters`      | `frontend/app/src/features/batch/hooks/useBatchParameters.ts`              | `frontend/app/src/features/batch/hooks/useBatchParameters.test.ts`              |
| `useBatchCorrection`      | `frontend/app/src/features/batch/hooks/useBatchCorrection.ts`              | `frontend/app/src/features/batch/hooks/useBatchCorrection.test.ts`              |
| `useTableData`            | `frontend/app/src/features/results/hooks/useTableData.ts`                  | `frontend/app/src/features/results/hooks/useTableData.test.ts`                  |
| `useTableFilters`         | `frontend/app/src/features/results/hooks/useTableFilters.ts`               | `frontend/app/src/features/results/hooks/useTableFilters.test.ts`               |
| `useTableState`           | `frontend/app/src/features/results/hooks/useTableState.ts`                 | `frontend/app/src/features/results/hooks/useTableState.test.ts`                 |
| `useGenerateHeatMap`      | `frontend/app/src/features/results/hooks/useGenerateHeatMap.ts`            | `frontend/app/src/features/results/hooks/useGenerateHeatMap.test.ts`            |
| `useHeatMapOptions`       | `frontend/app/src/features/results/hooks/useHeatMapOptions.ts`             | `frontend/app/src/features/results/hooks/useHeatMapOptions.test.ts`             |
| `useHeatMapGeneration`    | `frontend/app/src/features/results/hooks/useHeatMapGeneration.ts`          | `frontend/app/src/features/results/hooks/useHeatMapGeneration.test.ts`          |

### `useJobPolling`

Purpose: polls job status for long-running backend work.

Source path: `frontend/app/src/shared/hooks/useJobPolling.ts`

Signature:

```ts
useJobPolling(jobId: string | null, resetKey?: number): JobStatus | null
```

Parameters:

| Parameter  | Exact type            | Required | Description                                                      |
|------------|-----------------------|---------:|------------------------------------------------------------------|
| `jobId`    | `string \| null`      |      Yes | Job id to poll. Passing `null` disables polling.                 |
| `resetKey` | `number \| undefined` |       No | Changing this value clears the current status and retry counter. |

Return value: `JobStatus | null`, where `JobStatus` is defined in `frontend/app/src/shared/types/JobTypes.ts`.

Related state: local `jobStatus: JobStatus | null` and `failureCountRef: number`.

Endpoint dependency: `GET /api/v1/status/{jobId}`.

Polling interval: `3000` ms.

Polling stop conditions: `isTerminalState(phase, status)` returns true for `failed`, `normalization` + `waiting`, `batch` + `waiting`, `results` + `waiting`, and `heatmap` + `completed`.

Error handling: non-OK responses and invalid payloads are logged with `logger.warn`. After three consecutive failures, the previous status is converted to `failed` with a synthetic `ProblemDetail` connection error. If no status was ever received, the hook remains `null`.

Cleanup: clears the pending timeout and sets a local cancellation flag when the component unmounts or dependencies change.

Related components: `AnalysisPage`, `NormalizationPage`, `BatchPage`, `useHeatMapGeneration`, and `Progressbar`.

Usage:

```ts
const jobStatus = useJobPolling(job_id ?? null);
```

### `useJobCancel`

Purpose: sends the reset request used by the application header to cancel/delete the current analysis.

Source path: `frontend/app/src/shared/hooks/useJobCancel.ts`

Signature:

```ts
useJobCancel(jobId: string, onCancelSuccess: () => void): {
  cancelJob: () => Promise<void>;
  isLoading: boolean;
  error: ProblemDetail | null;
}
```

Parameters:

| Parameter         | Exact type   | Required | Description                                 |
|-------------------|--------------|---------:|---------------------------------------------|
| `jobId`           | `string`     |      Yes | Job id passed into `/api/v1/reset/{jobId}`. |
| `onCancelSuccess` | `() => void` |      Yes | Callback invoked after an OK response.      |

Return values:

| Property    | Exact type              | Description                                                 |
|-------------|-------------------------|-------------------------------------------------------------|
| `cancelJob` | `() => Promise<void>`   | Executes the POST request.                                  |
| `isLoading` | `boolean`               | True while the request is in flight.                        |
| `error`     | `ProblemDetail \| null` | Parsed backend problem details or a local connection error. |

Related state: `isLoading` and `error`.

Endpoint dependency: `POST /api/v1/reset/{jobId}`.

Error handling: non-OK responses are parsed as `ApiProblemDetail` and expose `details`. Network failures expose a local `ProblemDetail` with status `503`.

Cleanup: no abort controller; state is reset per request.

Related components: `AppLayout` and `AppHeader`.

Usage:

```ts
const { cancelJob, isLoading } = useJobCancel(jobId, () => {
  void navigate("/upload");
});
```

### `useUploadFlow`

Purpose: orchestrates the upload staging workflow from file inspection through review and commit.

Source path: `frontend/app/src/features/upload/hooks/useUploadFlow.ts`

Signature:

```ts
useUploadFlow(onStarted: (jobId: string) => void)
```

Parameters:

| Parameter   | Exact type                | Required | Description                                           |
|-------------|---------------------------|---------:|-------------------------------------------------------|
| `onStarted` | `(jobId: string) => void` |      Yes | Called after commit succeeds with the backend job id. |

Return values include:

| Property            | Exact type                                           | Description                                |
|---------------------|------------------------------------------------------|--------------------------------------------|
| `status`            | `"idle" \| "inspecting" \| "review" \| "committing"` | Workflow state.                            |
| `manifest`          | `InspectManifest \| null`                            | Last inspection result.                    |
| `error`             | `string \| null`                                     | User-facing workflow error.                |
| `sheets`            | `SampleSheetCandidate[]`                             | Detected sample sheets.                    |
| `visiblePairs`      | `IdatPair[]`                                         | IDAT pairs not removed by the user.        |
| `completePairs`     | `IdatPair[]`                                         | Visible complete Green/Red IDAT pairs.     |
| `selectedSheetId`   | `string \| null`                                     | Effective selected sheet id.               |
| `blockingError`     | `string \| null`                                     | Hard blocker text.                         |
| `selectionHint`     | `string \| null`                                     | Next-step hint.                            |
| `canCommit`         | `boolean`                                            | True when commit prerequisites are met.    |
| `mappingColumns`    | `string[]`                                           | Columns from the selected sheet.           |
| `columnMapping`     | `RoleSelection`                                      | Current role mapping.                      |
| `setRole`           | `(role: RoleKey, value: string \| null) => void`     | Updates one role.                          |
| `filterSettings`    | `FilterSettings`                                     | Current filter settings.                   |
| `setFilterSettings` | React state setter for `FilterSettings`              | Updates filter settings.                   |
| `inspect`           | `(files: File[]) => void`                            | Starts inspection.                         |
| `addFiles`          | `(files: File[]) => void`                            | Re-inspects existing plus new files.       |
| `removePair`        | `(pairId: string) => void`                           | Removes an IDAT pair from the visible set. |
| `selectSheet`       | React state setter for `string \| null`              | Selects a sample sheet.                    |
| `commit`            | `() => Promise<void>`                                | Commits and starts analysis.               |
| `reset`             | `() => void`                                         | Clears local state and discards staging.   |
| `discardOnUnmount`  | `() => void`                                         | Best-effort staging cleanup.               |

Endpoint dependencies: `POST /api/v1/upload/inspect`, `POST /api/v1/upload/commit`, and best-effort `DELETE /api/v1/upload/{sessionId}` through `uploadApi.ts`.

Related state: file refs, staging session ref, selected sheet, removed pair ids, column mapping, and filter settings.

Side effects: discards previous staging sessions before a new inspect; commits selected complete pairs and column mapping; invokes `onStarted(jobId)` after success.

Error handling: caught inspection and commit errors become string messages; commit failure returns the UI to `review`.

Cleanup: `discardOnUnmount` calls `discardUpload` if a staging session still exists. `discardUpload` intentionally swallows network errors.

Related components: `UploadPage`, `UploadDropzone`, `FileReviewList`, `ColumnRoleMapper`, `FilterPanel`, and `UploadSampleSheetPreviewModal`.

Usage:

```ts
const flow = useUploadFlow((jobId) => void navigate(`/analysis/${jobId}`));
```

### `useFilterStats`

Purpose: loads filtering audit statistics after the filtering phase has produced data.

Source path: `frontend/app/src/features/analysis/hooks/useFilterStats.ts`

Signature:

```ts
useFilterStats(jobId: string | null): {
  filterStats: FilteringStatsType | null;
  isLoading: boolean;
  error: string | null;
}
```

Endpoint dependency: `GET /api/v1/filter/{jobId}/stats`.

Related state: delegated to `useAsyncResource`.

Error handling: HTTP `409` is treated as expected "not ready" and returns `null`; other non-OK responses throw `Request failed (<status>): <statusText>`.

Cleanup: `useAsyncResource` aborts superseded fetches.

Related components: `AnalysisPage` and `FilteringStats`.

Usage:

```ts
const { filterStats, isLoading } = useFilterStats(statsJobId);
```

### `useNormalizationPreview`

Purpose: loads normalization preview metadata and plot/PCA data.

Source path: `frontend/app/src/features/normalization/hooks/useNormalizationPreview.ts`

Signature:

```ts
useNormalizationPreview(jobId: string | null): {
  data: NormalizationPreview | null;
  isLoading: boolean;
  error: ProblemDetail | Error | string | null;
  setError: (error: ProblemDetail | Error | string | null) => void;
}
```

Endpoint dependency: `GET /api/v1/preview/normalization/{jobId}`.

Error handling: non-OK responses are parsed as `ProblemDetail` where possible; otherwise a fallback problem is created with the response status. `ProblemError` is unwrapped through `mapError`.

Cleanup: `useAsyncResource` aborts superseded fetches.

Related components: `NormalizationPage`, `MethodCard`, and `PcaViewer`.

Usage:

```ts
const { data, isLoading, error, setError } = useNormalizationPreview(job_id ?? null);
```

### `useNormalizationSubmit`

Purpose: submits the selected normalization method and exposes the submit loading flag.

Source path: `frontend/app/src/features/normalization/hooks/useNormalizationSubmit.ts`

Signature:

```ts
useNormalizationSubmit(
  jobId: string | null,
  onError: (error: ProblemDetail | Error | string | null) => void,
): {
  submitMethod: (method: NormalizationMethod) => Promise<boolean>;
  isSubmitting: boolean;
}
```

Endpoint dependency: `POST /api/v1/normalize/{jobId}`.

Error handling: returns `false` and calls `onError` for missing job id, non-OK responses, and thrown errors. Successful submission returns `true`.

Cleanup: no abort controller; state is reset in `finally`.

Related components: `NormalizationPage`.

Usage:

```ts
const { submitMethod, isSubmitting } = useNormalizationSubmit(job_id ?? null, setError);
```

### `useBatchParameters`

Purpose: loads metadata columns and group values for batch correction and downstream comparison selection.

Source path: `frontend/app/src/features/batch/hooks/useBatchParameters.ts`

Signature:

```ts
useBatchParameters(jobId: string | null): {
  parameters: BatchParametersResponse | null;
  isLoading: boolean;
  error: string | null;
}
```

Endpoint dependency: `GET /api/v1/batch/{jobId}/batch-options`.

Error handling: non-OK responses throw `Failed to load batch parameters (HTTP <status>)`; failures are also logged through `logger.error`.

Cleanup: `useAsyncResource` aborts superseded fetches.

Related components: `BatchPage` and `BatchForm`.

Usage:

```ts
const { parameters, isLoading } = useBatchParameters(job_id ?? null);
```

### `useBatchCorrection`

Purpose: owns batch history retrieval, correction submission, and skip-to-analysis submission.

Source path: `frontend/app/src/features/batch/hooks/useBatchCorrection.ts`

Signature:

```ts
useBatchCorrection(jobId: string | undefined): {
  history: BatchHistoryResponse | null;
  loading: boolean;
  error: BatchErrorDetail | null;
  isSubmitting: boolean;
  fetchHistory: () => Promise<void>;
  runBatch: (request: BatchCorrectionRequest) => Promise<void>;
  skipBatch: (groupSelection?: GroupSelection) => Promise<void>;
}
```

Endpoint dependencies: `GET /api/v1/batch/{jobId}/history`, `POST /api/v1/batch/{jobId}`, and `POST /api/v1/batch/{jobId}/skip`.

Related state: `history`, `loading`, `error`, and `isSubmitting`.

Error handling: structured objects with `error` and `message` are preserved. Other history failures become `{ error: "UNKNOWN", message: "Failed to load batch history." }`; batch submission failures default to `BATCH_FAILED`; network failures default to `NETWORK_ERROR`; skip failures default to `SKIP_FAILED`.

Cleanup: no abort controller. The initial history load is triggered by an effect keyed by `fetchHistory`.

Related components: `BatchPage`, `BatchForm`, and `SvdPlot`.

Usage:

```ts
const { history, runBatch, skipBatch } = useBatchCorrection(job_id);
```

### `useTableData`

Purpose: loads paginated, sorted, filtered DMP or DMR table data.

Source path: `frontend/app/src/features/results/hooks/useTableData.ts`

Signature:

```ts
useTableData(
  jobId: string | null,
  table: string,
  sort_by: string | null,
  sort_order: string | null,
  filters?: TableFilters,
  page: number = 1,
  pageSize: number = 75,
): {
  data: TableData | null;
  loading: boolean;
  error: string | null;
}
```

Endpoint dependency: `GET /api/v1/table/{jobId}/{table}` with `sort_by`, `sort_order`, `page`, `page_size`, and `filter_<key>` query parameters.

Error handling: non-OK responses throw `Failed to load table`.

Cleanup: `useAsyncResource` aborts superseded fetches.

Related components: `TableContainer` and `AnalysisTable`.

Usage:

```ts
const { data, loading, error } = useTableData(
  job_id ?? null,
  activeTab,
  currentSort.sort_by,
  currentSort.sort_order,
  appliedFilters[activeTab],
  currentPage,
  pageSize,
);
```

### `useTableFilters`

Purpose: manages DMP and DMR table filter state with a draft/apply model.

Source path: `frontend/app/src/features/results/hooks/useTableFilters.ts`

Signature:

```ts
useTableFilters(onResetPage?: () => void): {
  draftFilters: { dmp: DmpFilters; dmr: DmrFilters };
  appliedFilters: { dmp: DmpFilters; dmr: DmrFilters };
  updateDraftFilter: <K extends keyof FilterState>(
    table: K,
    key: keyof FilterState[K],
    value: string,
  ) => void;
  applyFilters: <K extends keyof FilterState>(table: K) => void;
  resetFilters: <K extends keyof FilterState>(table: K) => void;
  hasFilters: <K extends keyof FilterState>(table: K) => boolean;
}
```

Endpoint dependency: none directly. `appliedFilters` are consumed by `useTableData`, CSV export, and heatmap generation.

Error handling: no network errors; validation is handled in `TableFilters`.

Cleanup: none.

Related components: `TableContainer` and `TableFilters`.

Usage:

```ts
const { draftFilters, appliedFilters, updateDraftFilter, applyFilters } = useTableFilters();
```

### `useTableState`

Purpose: manages active table tab, per-table sorting, and per-table pagination.

Source path: `frontend/app/src/features/results/hooks/useTableState.ts`

Signature:

```ts
useTableState(): {
  activeTab: "dmp" | "dmr";
  setActiveTab: React.Dispatch<React.SetStateAction<"dmp" | "dmr">>;
  sorting: Record<"dmp" | "dmr", TableSortState>;
  updateSorting: (table: "dmp" | "dmr", column: string) => void;
  pagination: Record<"dmp" | "dmr", PaginationState>;
  updatePage: (table: "dmp" | "dmr", page: number) => void;
}
```

Endpoint dependency: none directly. State drives `useTableData` and export query construction.

Behavior: sorting cycles from ascending to descending to no sort for the same column and resets that table to page `1`. Initial page size is `100` for both tables.

Related components: `TableContainer`, `TableTabs`, `AnalysisTable`, and `TablePagination`.

Usage:

```ts
const { activeTab, sorting, updateSorting, pagination, updatePage } = useTableState();
```

### `useGenerateHeatMap`

Purpose: submits a heatmap generation request.

Source path: `frontend/app/src/features/results/hooks/useGenerateHeatMap.ts`

Signature:

```ts
useGenerateHeatMap(jobId: string | null): {
  data: HeatMapResponse | null;
  isLoading: boolean;
  error: string | null;
  generateHeatMap: (payload: HeatMapRequest) => Promise<HeatMapResponse | null>;
}
```

Endpoint dependency: `POST /api/v1/heatmap/{jobId}`.

Error handling: missing job id sets `Missing job id`; non-OK responses use `readApiError`; thrown errors become their message or `Unknown error occurred`.

Cleanup: no abort controller; state is reset per request.

Related components: consumed by `useHeatMapGeneration`, which is used by `HeatMap`.

Usage:

```ts
const { generateHeatMap, isLoading, error } = useGenerateHeatMap(jobId);
```

### `useHeatMapOptions`

Purpose: loads grouping/annotation columns for heatmap generation.

Source path: `frontend/app/src/features/results/hooks/useHeatMapOptions.ts`

Signature:

```ts
useHeatMapOptions(jobId: string | null): UseAsyncResourceResult<HeatMapOptionsResponse, string>
```

Endpoint dependency: `GET /api/v1/heatmap/{jobId}/options`.

Error handling: non-OK responses throw `Failed to fetch heatmap options`.

Cleanup: `useAsyncResource` aborts superseded fetches.

Related components: `HeatMap`.

Usage:

```ts
const { data: options, isLoading } = useHeatMapOptions(job_id ?? null);
```

### `useHeatMapGeneration`

Purpose: coordinates heatmap POST, status polling, generated plot URL, and displayed error state.

Source path: `frontend/app/src/features/results/hooks/useHeatMapGeneration.ts`

Signature:

```ts
useHeatMapGeneration(jobId: string | null): {
  jobStatus: JobStatus | null;
  isGenerating: boolean;
  isPolling: boolean;
  heatmapSource: PlotSource | null;
  displayedError: ProblemDetail | Error | string | null;
  showError: boolean;
  dismissError: () => void;
  generate: (request: HeatMapRequest) => Promise<void>;
}
```

Endpoint dependencies: `POST /api/v1/heatmap/{jobId}` through `useGenerateHeatMap`, `GET /api/v1/status/{jobId}` through `useJobPolling`, and generated plot URLs `/api/v1/heatmap/{jobId}?t=<timestamp>` and `/api/v1/heatmap/{jobId}?format=pdf`.

Polling interval: inherited from `useJobPolling` (`3000` ms).

Polling stop conditions: stops when status is `completed` + phase `heatmap`, `waiting` + phase `results`, or `failed` + phase `heatmap`.

Error handling: combines POST errors, persistent failed-poll errors, and backend heatmap errors into `displayedError`; `dismissError` only hides the banner.

Cleanup: `useJobPolling` handles polling cleanup.

Related components: `HeatMap`, `Progressbar`, `ErrorMessage`, and `PlotView`.

Usage:

```ts
const { generate, heatmapSource, isPolling } = useHeatMapGeneration(job_id ?? null);
```

### `useAsyncResource`

Purpose: shared data-loading primitive for enabled async resources.

Source path: `frontend/app/src/shared/hooks/useAsyncResource.ts`

Signature:

```ts
useAsyncResource<T, E = string>(
  fetcher: (signal: AbortSignal) => Promise<T | null>,
  deps: React.DependencyList,
  options: UseAsyncResourceOptions<T, E> = {},
): {
  data: T | null;
  isLoading: boolean;
  error: E | null;
  setError: (error: E | null) => void;
}
```

Endpoint dependency: none directly; callers provide the fetcher.

Error handling: default mapper returns an error message string; callers can provide `mapError` and `onError`.

Cleanup: creates an `AbortController`, aborts superseded requests, and ignores abort errors.

Related hooks: `useFilterStats`, `useNormalizationPreview`, `useBatchParameters`, `useTableData`, `useHeatMapOptions`, and preview modal fetches.

## Error and Edge Cases

- Nullable job ids disable `useAsyncResource`-based hooks when they pass `enabled: jobId != null`.
- `useJobPolling` does not create a failed status if every status request fails before any previous status exists.
- `useFilterStats` treats `409` as not ready rather than an error.
- `useBatchCorrection` starts `loading` as `true`; when `jobId` is `undefined`, `fetchHistory` returns before setting it to `false`.
- `useUploadFlow` only commits complete IDAT pairs and requires all four role mappings to point to real columns.
- `useTableFilters` does not validate values itself; validation is implemented in the `TableFilters` component.
- `useHeatMapGeneration` can expose a heatmap image URL only after polling observes a successful terminal state.

## Cross-links

- [Frontend architecture](../architecture/frontend-architecture.md)
- [Pipeline progress states](../architecture/pipeline-progress.md)
- [API contract](../architecture/api-contract.md)
- [Components reference](components-reference.md)
- [Frontend theming and structure](theming.md)
