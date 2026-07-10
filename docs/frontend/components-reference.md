# Frontend Components Reference

**Scope:** React components in `frontend/app/src`, with detailed coverage for complex workflow, plotting, table, filtering, and layout components
**Audience:** Frontend developers, reviewers, and new team members
**Status:** Draft
**Last reviewed:** 2026-07-08

## Purpose

This document helps maintainers understand the frontend component surface without turning every private helper into a long API page. Complex and reusable components receive detailed reference sections. Simple supporting components are summarized in category tables.

## Scope

Covered code is under `frontend/app/src`. The detailed reference focuses on components requested by the checklist and verified in source:

- `TableContainer`
- `AnalysisTable`
- `TableFilters`
- `HeatMap`
- `SvdPlot`
- `PcaPlot`
- `PcaViewer`
- `Progressbar`
- `StepIndicator`
- `ColumnRoleMapper`
- `FilterPanel`
- `NormalizationPage`
- `BatchForm`

Page-level and small supporting components are listed where useful, but tiny private implementation helpers are not expanded beyond concise summaries.

## Concepts and Contract

Components follow the feature-based structure documented in `docs/architecture/frontend-architecture.md`. Shared reusable components live in `frontend/app/src/shared/`; feature-specific components live below `frontend/app/src/features/<feature>/components/`.

State-heavy and network-heavy behavior is generally delegated to hooks. Components are responsible for rendering, local UI state, user interactions, and composing child components. Export behavior for static plots is centralized in `frontend/app/src/shared/plots/`.

## Reference

### Detailed Complex Components

#### `TableContainer`

Purpose: orchestrates the results table view, including tabs, filters, server-side data loading, CSV export, and the heatmap panel.

Source path: `frontend/app/src/features/results/components/table/TableContainer.tsx`

Props: none.

Child composition:

- `TableTabs`
- `TableFilters`
- `SkeletonTable`
- `TableExportButton`
- `AnalysisTable`
- `HeatMap`
- `ErrorMessage`

Hooks and service dependencies:

- `useParams` for `job_id`
- `useTableState`
- `useTableFilters`
- `useTableData`
- `exportTableCsv`
- `logger`

User interactions:

- Switch between DMP and DMR tabs.
- Edit, apply, and reset filters.
- Sort table columns through `AnalysisTable`.
- Change pages through `TablePagination`.
- Download CSV through `TableExportButton`.
- Generate heatmaps when DMP is active through `HeatMap`.

Loading, error, and empty states:

- Shows `SkeletonTable` while `useTableData` is loading.
- Shows an inline danger panel when table loading fails.
- Shows `ErrorMessage` if CSV export fails.
- Delegates empty table rendering to `AnalysisTable`.

Accessibility and keyboard behavior:

- Inherits tab semantics from `TableTabs`.
- Uses standard buttons and form controls in child components.

Export behavior:

- Builds query parameters from the current sort and applied filters.
- Calls `exportTableCsv(job_id, activeTab, params)`.
- Download filename is created by `exportTableCsv`.

Edge cases:

- If `job_id` is missing, CSV export returns early and table fetching is disabled by `useTableData`.
- Heatmap is rendered only for the DMP tab.

Related tests: `frontend/app/src/features/results/components/table/TableContainer.test.tsx`.

Usage:

```tsx
export function ResultsPage() {
  return <TableContainer />;
}
```

#### `AnalysisTable`

Purpose: renders paginated genomic result data with server-side sort triggers.

Source path: `frontend/app/src/features/results/components/table/AnalysisTable.tsx`

Props:

| Prop           | Exact type                                                                      | Required | Description                                         |
|----------------|---------------------------------------------------------------------------------|---------:|-----------------------------------------------------|
| `data`         | `TableData \| null`                                                             |      Yes | Columns, rows, and pagination metadata.             |
| `sorting`      | `{ sort_by: string \| null; sort_order: "asc" \| "desc" \| null } \| undefined` |       No | Current server-side sort state.                     |
| `onSort`       | `((columnKey: string) => void) \| undefined`                                    |       No | Called when a sortable column header is clicked.    |
| `onPageChange` | `((page: number) => void) \| undefined`                                         |       No | Called by pagination controls. Defaults to a no-op. |

Child composition:

- Material UI `Table`, `TableContainer`, `TableSortLabel`, and related table elements.
- `TablePagination` above and below the table when more than one page exists.

Hooks and service dependencies:

- Local `useState`, `useRef`, and `useEffect` for horizontal-scroll affordance.
- `formatCellValue` for cell formatting.

User interactions:

- Click sortable headers to call `onSort(column.key)`.
- Use pagination controls.
- Horizontal scroll updates the right-scroll indicator.

Loading, error, and empty states:

- Does not own loading or server errors.
- If `data`, `data.columns`, or `data.data` is missing, renders "No data available."

Accessibility and keyboard behavior:

- Material UI table semantics are used.
- Sort controls are Material UI `TableSortLabel` controls.
- Pagination controls are accessible buttons in `TablePagination`.

Edge cases:

- Uses row index as table row key because backend rows do not expose a guaranteed stable id in the table contract.
- The scroll indicator is visual only and has `pointerEvents: "none"`.

Related tests: `frontend/app/src/features/results/components/table/AnalysisTable.test.tsx`.

Usage:

```tsx
<AnalysisTable
  data={data}
  sorting={currentSort}
  onSort={handleSort}
  onPageChange={handlePageChange}
/>
```

#### `TableFilters`

Purpose: renders DMP or DMR filter inputs, validates them, and exposes apply/reset actions.

Source path: `frontend/app/src/features/results/components/table/TableFilters.tsx`

Props:

| Prop       | Exact type                                           | Required | Description                        |
|------------|------------------------------------------------------|---------:|------------------------------------|
| `table`    | `"dmp" \| "dmr"`                                     |      Yes | Selects the filter definition set. |
| `filters`  | `T extends DmpFilters \| DmrFilters`                 |      Yes | Current draft filter values.       |
| `onChange` | `<K extends keyof T>(key: K, value: string) => void` |      Yes | Updates one field.                 |
| `onApply`  | `() => void`                                         |      Yes | Applies the current draft values.  |
| `onReset`  | `() => void`                                         |      Yes | Clears filters.                    |

Child composition:

- Shared `Button`.
- Material UI icons `ArrowDropDownIcon` and `ArrowRightIcon`.
- Generated `<select>` and text inputs from `FILTER_DEFINITIONS`.

Hooks and service dependencies: local `useState` for expanded/collapsed filter panel. No direct network dependency.

User interactions:

- Toggle filter panel.
- Enter filter values.
- Apply filters.
- Reset all filters.

Loading, error, and empty states:

- No loading state.
- Shows field-level validation messages for invalid numeric values, values outside min/max, and `start > stop`.
- Disables Apply when there are no filters or validation errors exist.

Accessibility and keyboard behavior:

- Uses native inputs, selects, and buttons.
- Invalid fields set `aria-invalid`.

Edge cases:

- Numeric fields are rendered as text inputs with `inputMode="decimal"` so invalid values remain visible and can be corrected.
- Filter options are hard-coded in this component and must match backend-supported filters.

Related tests: `frontend/app/src/features/results/components/table/TableFilters.test.tsx`.

Usage:

```tsx
<TableFilters<DmpFilters>
  table="dmp"
  filters={draftFilters.dmp}
  onChange={(field, value) => updateDraftFilter("dmp", field, value)}
  onApply={() => applyFilters("dmp")}
  onReset={() => resetFilters("dmp")}
/>
```

#### `HeatMap`

Purpose: lets users generate a heatmap from the currently applied DMP table filters.

Source path: `frontend/app/src/features/results/components/heatmap/HeatMap.tsx`

Props:

| Prop       | Exact type               | Required | Description                                          |
|------------|--------------------------|---------:|------------------------------------------------------|
| `filters`  | `Record<string, string>` |      Yes | Applied DMP filters forwarded to backend generation. |
| `rowCount` | `number \| undefined`    |       No | Current filtered row count for pre-check messaging.  |

Child composition:

- Material UI `Accordion`, `FormControl`, `Select`, `MenuItem`, and `Typography`.
- Shared `Button`, `Progressbar`, `ErrorMessage`, `PlotView`, and `HelpButton`.

Hooks and service dependencies:

- `useParams` for `job_id`.
- `useHeatMapOptions` for grouping columns.
- `useHeatMapGeneration` for POST, polling, image URL, and error consolidation.

User interactions:

- Expand/collapse the accordion.
- Select primary and optional secondary grouping columns.
- Click Generate Heatmap.
- Dismiss error message.
- Enlarge and export generated plot through `PlotView`.

Loading, error, and empty states:

- Disables grouping controls while options load or generation is in progress.
- Shows text when heatmap generation is starting but no polled status is available.
- Shows `Progressbar` while generation or polling is active.
- Shows `ErrorMessage` for generation or polling errors.
- Shows no result until `heatmapSource` exists.

Accessibility and keyboard behavior:

- Uses Material UI accordion and select controls.
- Help button is placed inside details rather than summary to avoid nested buttons.

Export behavior:

- `HeatMap` itself does not implement downloads.
- Generated `heatmapSource` is passed to `PlotView`, which exposes PNG/PDF export through `PlotExportButtons` and `downloadPlot`.
- No `downloadHeatmap` function exists in the current code.

Edge cases:

- Generation is blocked when `rowCount` is `0`.
- Generation is blocked when `rowCount` is greater than `500`.
- Secondary grouping options exclude the selected primary grouping column.
- Only non-empty filters are sent in the request.

Related tests: `frontend/app/src/features/results/components/heatmap/HeatMap.test.tsx`.

Usage:

```tsx
<HeatMap filters={appliedFilters.dmp} rowCount={data?.pagination?.total_rows} />
```

#### `SvdPlot`

Purpose: displays SVD diagnostic plots for batch correction rounds.

Source path: `frontend/app/src/features/batch/components/SvdPlot.tsx`

Props:

| Prop     | Exact type     | Required | Description                                        |
|----------|----------------|---------:|----------------------------------------------------|
| `rounds` | `BatchRound[]` |      Yes | Correction rounds with SVD plot URLs and settings. |

Child composition: `PlotView`.

Hooks and service dependencies: none.

User interactions:

- Plot preview, lightbox, and PNG/PDF exports are delegated to `PlotView`.

Loading, error, and empty states:

- If `rounds.length === 0`, renders "No SVD diagnostics available."

Accessibility and keyboard behavior:

- Inherits plot preview button behavior from `PlotView` and `PlotFigure`.

Export behavior:

- Each round creates a `PlotSource` with `pngUrl: "${r.svd_plot}?format=png"` and `pdfUrl: "${r.svd_plot}?format=pdf"`.

Edge cases:

- Round title changes for `initial` versus correction rounds.
- Protected covariates text falls back to `none` when the list is empty.

Related tests: `frontend/app/src/features/batch/components/SvdPlot.test.tsx`.

Usage:

```tsx
<SvdPlot rounds={history.rounds} />
```

#### `PcaPlot`

Purpose: renders PCA data as an SVG scatter plot that can be displayed inline or exported by `PcaViewer`.

Source path: `frontend/app/src/features/normalization/components/PcaPlot.tsx`

Props:

| Prop             | Exact type               | Required | Default |
|------------------|--------------------------|---------:|---------|
| `data`           | `PcaData`                |      Yes | -       |
| `groupColors`    | `Record<string, string>` |      Yes | -       |
| `sampleColors`   | `Record<string, string>` |      Yes | -       |
| `labeledSamples` | `string[] \| undefined`  |       No | `[]`    |
| `showLegend`     | `boolean \| undefined`   |       No | `true`  |
| `width`          | `number \| undefined`    |       No | `760`   |
| `height`         | `number \| undefined`    |       No | `560`   |
| `fontScale`      | `number \| undefined`    |       No | `1`     |

Child composition: SVG elements, with a forwarded `SVGSVGElement` ref.

Hooks and service dependencies:

- `useMemo` for points, labels, layout, and legend entries.
- `niceTicks`, `NO_GROUP_COLOR`, and `NO_GROUP_LABEL`.

User interactions:

- None inside `PcaPlot`; it renders data passed by `MethodCard` or `PcaViewer`.
- SVG point titles expose sample/group details on hover in supporting browsers.

Loading, error, and empty states:

- If `data.error` exists, renders a danger-styled fallback.
- If `data.points` is empty, renders "No PCA data."

Accessibility and keyboard behavior:

- Not interactive by itself.
- Parent controls such as `MethodCard` and `PcaViewer` provide buttons and modal behavior.

Export behavior:

- Forwarded SVG ref is used by `PcaViewer` for PNG/PDF export.

Edge cases:

- Handles empty data by avoiding min/max calculations on empty arrays.
- Uses hard-coded SVG colors for plot readability; these are plot-specific, not theme tokens.

Related tests: `frontend/app/src/features/normalization/components/PcaPlot.test.tsx`.

Usage:

```tsx
<PcaPlot
  data={pca}
  groupColors={groupColors}
  sampleColors={sampleColors}
  labeledSamples={labeledSamples}
/>
```

#### `PcaViewer`

Purpose: modal viewer for interactive PCA recoloring, point labels, and plot export.

Source path: `frontend/app/src/features/normalization/components/PcaViewer.tsx`

Props:

| Prop      | Exact type   | Required | Description                 |
|-----------|--------------|---------:|-----------------------------|
| `method`  | `string`     |      Yes | Normalization method label. |
| `data`    | `PcaData`    |      Yes | PCA points and metadata.    |
| `onClose` | `() => void` |      Yes | Closes the modal.           |

Child composition:

- `Modal`
- `PcaPlot`
- Shared `Button`
- `ErrorMessage`

Hooks and service dependencies:

- Local state for group colors, sample overrides, labels, selected sample, selected color, export state, and export error.
- `exportSvgAsPng`
- `exportSvgAsPdf`
- `logger`

User interactions:

- Change group colors through color inputs.
- Select a sample and color, then apply a sample-specific override.
- Remove sample color overrides.
- Add or remove point labels.
- Show all or hide all labels.
- Export as PNG or PDF.
- Reset colors.
- Close modal.

Loading, error, and empty states:

- Export buttons show an exporting label and are disabled while any export is in progress.
- Export failures are logged and shown through `ErrorMessage`.

Accessibility and keyboard behavior:

- Inherits modal focus trap, Escape behavior, scroll lock, and dialog semantics from `Modal`.
- Form controls have ARIA labels for sample and color selection.
- Remove-label buttons include per-sample labels.

Export behavior:

- PNG export calls `exportSvgAsPng(svg, "pca_<method>.png", 820, 600, 2)`.
- PDF export calls `exportSvgAsPdf(svg, "pca_<method>.pdf", 820, 600)`.

Edge cases:

- No export is started if `svgRef.current` is missing or another export is already running.
- Label dropdown is disabled when all points are labeled.

Related tests: `frontend/app/src/features/normalization/components/PcaViewer.test.tsx`.

Usage:

```tsx
{pcaMethod?.pca && (
  <PcaViewer method={pcaMethod.method} data={pcaMethod.pca} onClose={() => setPcaMethod(null)} />
)}
```

#### `Progressbar`

Purpose: displays backend job progress and optional continuation action.

Source path: `frontend/app/src/shared/components/Progressbar.tsx`

Props:

| Prop             | Exact type                  | Required | Default |
|------------------|-----------------------------|---------:|---------|
| `jobStatus`      | `JobStatus`                 |      Yes | -       |
| `showNextButton` | `boolean \| undefined`      |       No | `false` |
| `nextDisabled`   | `boolean \| undefined`      |       No | `true`  |
| `onNext`         | `(() => void) \| undefined` |       No | -       |

Child composition:

- Material UI `LinearProgress`
- Material UI `Alert`
- Shared `Button`

Hooks and service dependencies: none.

User interactions: optional Next button calls `onNext`.

Loading, error, and empty states:

- Progress state is derived from `jobStatus.progress_percent`.
- Failure state is detected from `jobStatus.status`.
- Failure details display `jobStatus.error.detail` or a generic fallback.

Accessibility and keyboard behavior:

- Uses semantic text and standard button behavior.
- Material UI alert is used for error content.

Edge cases:

- Progress color is `success` only when progress is exactly `100`; failed status overrides to `error`.

Related tests: `frontend/app/src/shared/components/Progressbar.test.tsx`.

Usage:

```tsx
<Progressbar jobStatus={jobStatus} showNextButton nextDisabled={!previewReady} onNext={goNext} />
```

#### `StepIndicator`

Purpose: renders the workflow step sequence and current step state.

Source path: `frontend/app/src/shared/layout/StepIndicator.tsx`

Props:

| Prop            | Exact type            | Required | Description                                    |
|-----------------|-----------------------|---------:|------------------------------------------------|
| `currentStepId` | `number \| undefined` |       No | Current workflow step id from `workflowSteps`. |

Child composition: ordered list built from `frontend/app/src/shared/layout/workflowSteps.ts`.

Hooks and service dependencies: none.

User interactions: none.

Loading, error, and empty states: none.

Accessibility and keyboard behavior:

- Renders `<nav aria-label="Step indicator">`.
- Current item receives `aria-current="step"`.
- Screen-reader-only text communicates current, completed, or pending status.

Edge cases:

- With `currentStepId` undefined, all steps render as pending.

Related tests: covered through `frontend/app/src/shared/layout/AppLayout.test.tsx` and `workflowSteps.test.ts`.

Extension guidance: add or change workflow steps in `workflowSteps.ts`, not inside `StepIndicator`.

Usage:

```tsx
<StepIndicator currentStepId={currentStep?.id} />
```

#### `ColumnRoleMapper`

Purpose: maps canonical analysis roles to sample-sheet columns.

Source path: `frontend/app/src/features/upload/components/ColumnRoleMapper.tsx`

Props:

| Prop       | Exact type                                       | Required | Default |
|------------|--------------------------------------------------|---------:|---------|
| `columns`  | `string[]`                                       |      Yes | -       |
| `mapping`  | `Record<RoleKey, string \| null>`                |      Yes | -       |
| `onChange` | `(role: RoleKey, value: string \| null) => void` |      Yes | -       |
| `disabled` | `boolean \| undefined`                           |       No | `false` |

Child composition: four native `<select>` controls for `sentrix_id`, `sentrix_position`, `sample_group`, and `sample_name`.

Hooks and service dependencies: none.

User interactions:

- Select or clear a column for each required role.
- Columns already selected for other roles are hidden from the current role options.

Loading, error, and empty states:

- No explicit error state.
- Missing selections use warning border styling.
- Controls are disabled if `disabled` is true or no columns are available.

Accessibility and keyboard behavior:

- Each select has `aria-label="Column for <RoleLabel>"`.
- Native select keyboard behavior applies.

Edge cases:

- The current role's selected column remains available in its own options even though it is excluded elsewhere.

Related tests: `frontend/app/src/features/upload/components/ColumnRoleMapper.test.tsx`.

Usage:

```tsx
<ColumnRoleMapper
  columns={mappingColumns}
  mapping={columnMapping}
  onChange={onSetRole}
  disabled={disabled}
/>
```

#### `NormalizationPage`

Purpose: page for previewing normalization methods, selecting one, submitting it, and polling until batch correction is ready.

Source path: `frontend/app/src/features/normalization/NormalizationPage.tsx`

Props: none.

Child composition:

- `LoadingScreen`
- `ErrorMessage`
- `PcaViewer`
- `HelpButton`
- `MethodCard`
- `Progressbar`
- Shared `Button`

Hooks and service dependencies:

- `useParams`
- `useNavigate`
- `useNormalizationPreview`
- `useNormalizationSubmit`
- `useJobPolling`
- `orderMethods`
- `shouldNavigateToBatch`

User interactions:

- Select a method card.
- Open PCA viewer from a method card.
- Confirm selected method.
- Dismiss error snackbar.

Loading, error, and empty states:

- Shows `LoadingScreen` while preview data loads.
- Returns `null` when neither data nor error exists after loading.
- Shows `ErrorMessage` for preview or submit errors.
- Shows `Progressbar` while normalization polling is active and a status is available.

Accessibility and keyboard behavior:

- Uses shared buttons and modal behavior through children.

Edge cases:

- Confirm is disabled until a method is selected or while submitting/normalizing.
- After successful submission, route navigation to `/batch/{job_id}` is driven by polled job status and `shouldNavigateToBatch`.

Related tests: `frontend/app/src/features/normalization/NormalizationPage.test.tsx`.

Usage:

```tsx
<Route path="/normalization/:job_id" element={<NormalizationPage />} />
```

#### `BatchForm`

Purpose: collects batch correction settings and downstream case/control comparison settings.

Source path: `frontend/app/src/features/batch/components/BatchForm.tsx`

Props:

| Prop         | Exact type                                            | Required | Default |
|--------------|-------------------------------------------------------|---------:|---------|
| `parameters` | `BatchParametersResponse`                             |      Yes | -       |
| `onSubmit`   | `(data: BatchFormData) => void`                       |      Yes | -       |
| `isLoading`  | `boolean \| undefined`                                |       No | `false` |
| `onSkip`     | `((selection?: GroupSelection) => void) \| undefined` |       No | -       |

Child composition:

- Material UI `Alert`, `Autocomplete`, `FormControl`, `InputLabel`, `MenuItem`, `Select`, and `TextField`.
- `HelpButton`
- Shared `Button`
- `BatchSampleSheetPreviewModal`

Hooks and service dependencies:

- Local state for batch variable, covariates, preview modal, validation error, clicked action, comparison column, case group, and control group.
- Utility functions `defaultGroupSelection`, `isComparisonReady`, `levelsOf`, and `valuesOf`.
- TypeScript color tokens for the info `Alert` `sx` styling.

User interactions:

- Select a batch variable.
- Select multiple covariates.
- Preview sample sheet.
- Select comparison column, case group, and control group.
- Start batch correction.
- Proceed to analysis without correction when `onSkip` is supplied.

Loading, error, and empty states:

- MUI controls are disabled while `isLoading`.
- Shows validation error when submitting without a batch variable.
- Shows case/control warning when both selected groups are the same.
- Button labels reflect the clicked action while loading.
- Reloads page after successful batch iteration and SVD plot generation.

Accessibility and keyboard behavior:

- Uses labels, Material UI select/autocomplete behavior, and shared buttons.

Edge cases:

- Selecting a batch variable removes it from the covariate list.
- Skip sends `undefined` when there are no columns; otherwise it sends the selected comparison.
- Skip is disabled when comparison selection is incomplete.

Related tests: `frontend/app/src/features/batch/components/BatchForm.test.tsx` and `BatchForm.help.test.tsx`.

Usage:

```tsx
<BatchForm
  parameters={parameters}
  isLoading={batchRunning || showProgressBar}
  onSubmit={(data) => void handleSubmit(data)}
  onSkip={(selection) => void handleSkip(selection)}
/>
```

### Supporting Components Summary

#### Application and Layout

| Component   | Source path                                    | Purpose                                                                  |
|-------------|------------------------------------------------|--------------------------------------------------------------------------|
| `App`       | `frontend/app/src/App.tsx`                     | Route table wrapped in `AppLayout` and `ErrorBoundary`.                  |
| `AppLayout` | `frontend/app/src/shared/layout/AppLayout.tsx` | Application shell, phase label, reset wiring, header/footer composition. |
| `AppHeader` | `frontend/app/src/shared/layout/AppHeader.tsx` | Brand, landing navigation, step indicator, reset dialog.                 |
| `AppFooter` | `frontend/app/src/shared/layout/AppFooter.tsx` | Footer branding, imprint, privacy link.                                  |

#### Shared UI, Errors, Help, and Plots

| Component                 | Source path                                                      | Purpose                                                      |
|---------------------------|------------------------------------------------------------------|--------------------------------------------------------------|
| `Button`                  | `frontend/app/src/shared/components/Button.tsx`                  | Canonical application button.                                |
| `BackButton`              | `frontend/app/src/shared/components/BackButton.tsx`              | Browser-history back action.                                 |
| `Modal`                   | `frontend/app/src/shared/components/Modal.tsx`                   | Accessible dialog primitive with focus trap and scroll lock. |
| `ConfirmDialog`           | `frontend/app/src/shared/components/ConfirmDialog.tsx`           | Confirmation modal for consequential actions.                |
| `FallbackPage`            | `frontend/app/src/shared/components/FallbackPage.tsx`            | Error and not-found fallback page.                           |
| `SampleSheetPreviewTable` | `frontend/app/src/shared/components/SampleSheetPreviewTable.tsx` | Read-only sample sheet preview.                              |
| `ErrorBoundary`           | `frontend/app/src/shared/errors/ErrorBoundary.tsx`               | Route-aware render error fallback.                           |
| `ErrorMessage`            | `frontend/app/src/shared/errors/ErrorMessage.tsx`                | Snackbar/alert error display.                                |
| `HelpButton`              | `frontend/app/src/shared/help/HelpButton.tsx`                    | Contextual help modal trigger.                               |
| `HelpContent`             | `frontend/app/src/shared/help/HelpContent.tsx`                   | Markdown renderer for help topics.                           |
| `PlotView`                | `frontend/app/src/shared/plots/PlotView.tsx`                     | Static plot preview, lightbox, and export composition.       |
| `PlotFigure`              | `frontend/app/src/shared/plots/PlotFigure.tsx`                   | Keyboard-accessible plot preview button.                     |
| `PlotLightbox`            | `frontend/app/src/shared/plots/PlotLightbox.tsx`                 | Enlarged plot modal.                                         |
| `PlotExportButtons`       | `frontend/app/src/shared/plots/PlotExportButtons.tsx`            | PNG/PDF download controls.                                   |

#### Upload Support

| Component                       | Source path                                                                     | Purpose                                                             |
|---------------------------------|---------------------------------------------------------------------------------|---------------------------------------------------------------------|
| `UploadPage`                    | `frontend/app/src/features/upload/UploadPage.tsx`                               | Upload inspect, review, filter, and commit page.                    |
| `UploadDropzone`                | `frontend/app/src/features/upload/components/UploadDropzone.tsx`                | File, ZIP, folder, and drag/drop input.                             |
| `FileReviewList`                | `frontend/app/src/features/upload/components/FileReviewList.tsx`                | Sample-sheet and IDAT-pair review UI.                               |
| `UploadSampleSheetPreviewModal` | `frontend/app/src/features/upload/components/UploadSampleSheetPreviewModal.tsx` | Staged sample-sheet preview modal.                                  |
| `UploadSpinner`                 | `frontend/app/src/features/upload/components/UploadSpinner.tsx`                 | Small upload workflow spinner.                                      |
| Filter child controls           | `frontend/app/src/features/upload/components/filters/*.tsx`                     | Individual filter toggles and numeric fields used by `FilterPanel`. |

#### Page and Feature Support

| Component                      | Source path                                                                   | Purpose                                       |
|--------------------------------|-------------------------------------------------------------------------------|-----------------------------------------------|
| `AnalysisPage`                 | `frontend/app/src/features/analysis/AnalysisPage.tsx`                         | Filtering and preview progress page.          |
| `FilteringStats`               | `frontend/app/src/features/analysis/components/FilteringStats.tsx`            | Filtering statistics display.                 |
| `InfoPanel`                    | `frontend/app/src/features/analysis/components/InfoPanel.tsx`                 | Generic analysis status panel.                |
| `MethodCard`                   | `frontend/app/src/features/normalization/components/MethodCard.tsx`           | Selectable normalization method preview card. |
| `LoadingScreen`                | `frontend/app/src/features/normalization/components/LoadingScreen.tsx`        | Minimal full-screen loading or error message. |
| `BatchPage`                    | `frontend/app/src/features/batch/BatchPage.tsx`                               | Batch correction page orchestration.          |
| `BatchSampleSheetPreviewModal` | `frontend/app/src/features/batch/components/BatchSampleSheetPreviewModal.tsx` | Job sample-sheet preview modal.               |
| `ResultsPage`                  | `frontend/app/src/features/results/ResultsPage.tsx`                           | Results page wrapper around `TableContainer`. |
| `TableTabs`                    | `frontend/app/src/features/results/components/table/TableTabs.tsx`            | DMP/DMR tab selector.                         |
| `TablePagination`              | `frontend/app/src/features/results/components/table/TablePagination.tsx`      | Sliding-window pagination.                    |
| `TableExportButton`            | `frontend/app/src/features/results/components/table/TableExportButton.tsx`    | CSV export trigger.                           |
| `SkeletonTable`                | `frontend/app/src/features/results/components/table/SkeletonTable.tsx`        | Loading skeleton for result tables.           |

#### Landing and Static Pages

| Component               | Source path                                                              | Purpose                     |
|-------------------------|--------------------------------------------------------------------------|-----------------------------|
| `LandingPage`           | `frontend/app/src/features/landing/LandingPage.tsx`                      | Composes landing sections.  |
| `HeroSection`           | `frontend/app/src/features/landing/components/HeroSection.tsx`           | Overview and start CTA.     |
| `LandingLogo`           | `frontend/app/src/features/landing/components/LandingLogo.tsx`           | Displays `logo.svg`.        |
| `WorkflowSection`       | `frontend/app/src/features/landing/components/WorkflowSection.tsx`       | Workflow cards.             |
| `GettingStartedSection` | `frontend/app/src/features/landing/components/GettingStartedSection.tsx` | Beginner topic cards.       |
| `FaqSection`            | `frontend/app/src/features/landing/components/FaqSection.tsx`            | FAQ details accordions.     |
| `GlossarySection`       | `frontend/app/src/features/landing/components/GlossarySection.tsx`       | Glossary cards.             |
| `PrivacyPolicyPage`     | `frontend/app/src/shared/pages/PrivacyPolicyPage.tsx`                    | Static privacy policy page. |

## Error and Edge Cases

- `TableContainer` exits CSV export early when no route job id exists.
- `AnalysisTable` renders an empty state when table data is absent or malformed.
- `HeatMap` blocks generation for zero selected CpGs or more than `500` selected CpGs.
- `PcaPlot` renders explicit fallback content for PCA errors and empty point arrays.
- `PcaViewer` prevents overlapping exports and surfaces export failures through `ErrorMessage`.
- `BatchForm` prevents using the batch variable as a covariate by filtering covariate options.
- `ColumnRoleMapper` prevents assigning the same column to multiple roles through option filtering.
- `Progressbar` falls back to a generic error message when `jobStatus.error.detail` is missing.

## Cross-links

- [Hooks reference](hooks-reference.md)
- [Frontend theming and structure](theming.md)
- [Frontend architecture](../architecture/frontend-architecture.md)
- [API contract](../api/api-contract.md)
- [Pipeline progress](../architecture/pipeline-progress.md)
