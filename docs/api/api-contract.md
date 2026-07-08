# MethylAnalyzer — API Contract

**Scope:** `backend/app/api/routes/` — the public HTTP API under `/api/v1`

**Base URL:** `/api/v1`

> This document is the authoritative, hand-maintained contract for the REST API. FastAPI also generates a live **OpenAPI/Swagger UI at `:8000/docs`** from the code — use it as the up-to-date, machine-readable source; use this document for the intended behaviour, error semantics, and examples.
>
> Related documents (referenced instead of duplicated): the full `phase`/`status` value set and the state machine live in [job-lifecycle.md](./job-lifecycle.md); the end-to-end table/heatmap filter mapping in [filter-mapping.md](../contracts/filter-mapping.md); the canonical sample sheet and role mapping in [samplesheet-spec.md](../contracts/samplesheet-spec.md); the on-disk artifacts each endpoint reads in [job-directory-layout.md](../contracts/job-directory-layout.md); the progress/streaming semantics in [pipeline-progress.md](./pipeline-progress.md); the overall design in [backend-architecture.md](./backend-architecture.md).

---

## Table of Contents

- [Error Format](#error-format)
- [Global Errors](#global-errors)
- [Service Endpoints](#service-endpoints)
- [1. Upload & Job Initialization](#1-upload--job-initialization)
- [2. Status](#2-status)
- [3. Filter](#3-filter)
- [4. Normalization Preview](#4-normalization-preview)
- [5. Normalization](#5-normalization)
- [6. Batch Correction](#6-batch-correction)
- [7. Table](#7-table)
- [8. Heatmap](#8-heatmap)
- [9. Reset](#9-reset)

---

## Versioning

All endpoints are served under the `/api/v1` prefix. Breaking changes will be introduced under a new prefix (`/api/v2`); within `v1`, changes are additive or backwards-compatible. Endpoints marked **deprecated** (currently the legacy single-shot `POST /upload`) remain functional but should not be used by new clients.

---

## Error Format

All error responses conform to **Problem Details for HTTP APIs** ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)) and are produced centrally by `core/error_types.problem_detail()`.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | A stable, machine-readable identifier for the problem *class*, as a relative URI (e.g. `/errors/job-not-found`). |
| `title` | `string` | Yes | Short, human-readable label for the problem class (generic, not instance-specific). |
| `status` | `integer` | Yes | HTTP status code — identical to the response header. |
| `detail` | `string` | Yes | Human-readable explanation of this specific occurrence. |
| `instance` | `string` | No | Path of the affected request/resource. Present when the raising route supplies it. |
| *extras* | *any* | No | Some errors add contextual members — e.g. `job_id`, `provided`, `available`, `current_phase`, `current_status`. These are documented per endpoint. |

> A machine-readable per-field validation array is **not** currently emitted; field-level request validation (Pydantic) is surfaced by FastAPI's default `422` response.

**Example:**

```json
{
  "type": "/errors/invalid-batch-variable",
  "title": "Invalid batch variable",
  "status": 400,
  "detail": "Column 'Wrong_Column' is not available as a variable in the sample sheet.",
  "instance": "/api/v1/batch/4a7b9c12-e832-4fd3-a611-123456789abc",
  "provided": "Wrong_Column",
  "available": ["Sample_Group", "Age", "Array_Batch"]
}
```

---

## Global Errors

These states are not specific to one endpoint. They may occur on any call that takes a `job_id` (or `session_id`) path parameter.

### G-404: Job Not Found

Returned when the `job_id` does not exist (unknown, or the in-memory session was evicted while no files remain).

```json
{
  "type": "/errors/job-not-found",
  "title": "Job not found",
  "status": 404,
  "detail": "Job '4a7b9c12-e832-4fd3-a611-123456789abc' was not found.",
  "instance": "/api/v1/{route}/{job_id}"
}
```

### G-409: Invalid State Transition

Returned when the requested action conflicts with the job's current phase/status (e.g. starting a step while the job is already `running`). Raised by the state machine — see [job-lifecycle.md](./job-lifecycle.md).

```json
{
  "type": "/errors/invalid-state-transition",
  "title": "Invalid state transition",
  "status": 409,
  "detail": "The transition from (normalization, running) is not allowed.",
  "instance": "/api/v1/{route}/{job_id}",
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

### G-410: Session Expired

Returned when a job's files still exist on disk but its in-memory session is gone (e.g. after a backend restart). The client should start a new job.

```json
{
  "type": "/errors/session-expired",
  "title": "Session expired",
  "status": 410,
  "detail": "The session for job '4a7b9c12-…' is no longer available on the server.",
  "instance": "/api/v1/{route}/{job_id}"
}
```

---

## Service Endpoints

Two unversioned endpoints exist outside `/api/v1` for operations:

| Method | Path | Purpose | Response |
|--------|------|---------|----------|
| `GET` | `/` | Service identity. | `{ "message": "Methylation Analysis API", "version": "1.0" }` |
| `GET` | `/health` | Liveness/readiness probe (dependency-free). | `{ "status": "ok" }` |

---

## 1. Upload & Job Initialization

**Base Path:** `/api/v1/upload`

Uploading is a **two-phase flow**: the client first *inspects* a folder/ZIP/file selection (staged server-side, not yet a job), reviews the classified result and maps the sample-sheet columns, then *commits* the confirmed selection to create the job. Nothing enters `jobs/` until commit. A legacy single-shot `POST /upload` is retained for backwards compatibility.

The canonical sample-sheet format, the four column roles, and the mapping/validation rules are specified in [samplesheet-spec.md](../contracts/samplesheet-spec.md).

### Validation Constraints

| Rule | Value |
|------|-------|
| Supported file formats | `.idat`, `.csv`, `.xlsx`, `.xls` |
| IDAT files | must be paired (Grn + Red per sample) |
| Maximum total upload size | `MAX_TOTAL_UPLOAD_MB` (default **900 MB**) |
| Maximum sample sheet size | `MAX_SAMPLE_SHEET_MB` (default **10 MB**) |
| Maximum samples per job | `MAX_SAMPLES_PER_JOB` (default **48**, `0` = unlimited) |
| Total job-disk budget | `MAX_JOBS_DISK_GB` (`0` = unlimited) |

Size/count limits are environment-configurable — see [configuration.md](../backend/configuration.md).

---

### 1.1 POST `/upload/inspect`

Stages a folder/ZIP/file selection and returns a **manifest** classifying everything found (sample-sheet candidates, IDAT pairs, unusable files). Creates a short-lived staging session; no job is created.

- **URL:** `/api/v1/upload/inspect`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

#### Request (Form-Data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | `File[]` | Yes | The selected files, a folder's contents, or a single ZIP archive. |

#### Success Response (201 Created) — `InspectManifest`

```json
{
  "session_id": "9f1c…",
  "source": "zip",
  "sample_sheets": [
    {
      "id": "s0",
      "name": "SampleSheet.csv",
      "rel_path": "SampleSheet.csv",
      "size_bytes": 4096,
      "recognized": true,
      "recommended": true,
      "sample_count": 8,
      "columns": ["Sample_Name", "Sentrix_ID", "Sentrix_Position", "Sample_Group"],
      "suggested_mapping": {
        "sentrix_id": "Sentrix_ID",
        "sentrix_position": "Sentrix_Position",
        "sample_group": "Sample_Group",
        "sample_name": "Sample_Name"
      }
    }
  ],
  "idats": [
    { "pair_id": "20689…_R01C01", "grn": { "name": "…_Grn.idat", "rel_path": "…", "size_bytes": 8123456 }, "red": { "name": "…_Red.idat", "rel_path": "…", "size_bytes": 8123456 }, "complete": true }
  ],
  "other_files": [],
  "errors": [],
  "expires_at": "2026-07-08T14:00:00Z"
}
```

`suggested_mapping` pre-fills the role dropdowns where a confident alias match exists; the user confirms or overrides it before commit. `errors[]` carries non-fatal, UI-blocking conditions (e.g. more than one sample sheet).

#### Error Responses

| Status | `type` | When |
|--------|--------|------|
| 400 | `/errors/invalid-archive` | The ZIP is corrupt or not a ZIP. |
| 400 | `/errors/archive-too-large` | The archive/upload exceeds the size or file-count limit. |
| 400 | `/errors/no-supported-files` | No usable IDAT/sample-sheet files were found. |

---

### 1.2 GET `/upload/{session_id}/preview`

Returns a small tabular preview of one staged sample-sheet candidate, so the user can map its columns to roles.

- **URL:** `/api/v1/upload/{session_id}/preview`
- **Method:** `GET`

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sheet_id` | `string` | Yes | The candidate's `id` from the manifest. |
| `rows` | `integer` | No | Preview row count (1–200, default 20). |

#### Success Response (200 OK) — `SheetPreview`

```json
{ "sheet_id": "s0", "columns": ["Sample_Name", "Sentrix_ID", "…"], "rows": [["HeLa", "20689…", "…"]], "total_rows": 8, "truncated": false }
```

#### Error Responses

| Status | `type` | When |
|--------|--------|------|
| 404 | `/errors/session-not-found` | Unknown/invalid `session_id`, or the sheet id does not exist. |
| 410 | `/errors/session-expired` | The staging session's TTL has passed. |

---

### 1.3 POST `/upload/commit`

Validates the confirmed selection (chosen sample sheet, IDAT pairs, role mapping) and the intake budget, moves exactly the selected files into a new `jobs/<job_id>/`, persists the filter settings, creates the job, and starts the filtering => normalization-preview pipeline.

- **URL:** `/api/v1/upload/commit`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Request Body — `CommitRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | `string` | Yes | The staging session to commit. |
| `selected_sample_sheet_id` | `string` | Yes | The chosen candidate's `id`. |
| `selected_pair_ids` | `string[]` | Yes | The IDAT pair ids to include. |
| `column_mapping` | `object` | Yes | Maps the four roles to raw columns: `sentrix_id`, `sentrix_position`, `sample_group`, `sample_name`. All four required and mutually distinct. |
| `filter_settings` | `object` | No | Filter configuration (see [structure below](#filter_settings-structure)); defaults to all-disabled. |

#### Success Response (201 Created) — `UploadResponse`

```json
{ "job_id": "550e8400-e29b-41d4-a716-446655440000", "status": "waiting", "filter_settings": { "det_p": { "enabled": false, "cutoff": 0.01 }, "…": {} } }
```

#### Error Responses

| Status | `type` | When |
|--------|--------|------|
| 400 | `/errors/no-sample-sheet` · `/errors/no-idat-files` · `/errors/unpaired-idats` | Missing/incomplete selection. |
| 400 | `/errors/invalid-selection` | A selected file/pair is not in the staging session. |
| 400 | `/errors/invalid-column-mapping` | A mapped column is absent, or the chip columns match no selected IDAT pair. |
| 400 | `/errors/too-many-samples` | The cohort exceeds `MAX_SAMPLES_PER_JOB`. |
| 507 | `/errors/storage-limit-exceeded` | The job-disk budget (`MAX_JOBS_DISK_GB`) is exhausted. |
| 404 | `/errors/session-not-found` · 410 `/errors/session-expired` | Staging session missing/expired. |
| 500 | `/errors/save-failed` | Persisting the committed files failed (the partial job dir is rolled back). |

---

### 1.4 DELETE `/upload/{session_id}`

Discards a staging session and its files before commit.

- **URL:** `/api/v1/upload/{session_id}` · **Method:** `DELETE`
- **Success:** `204 No Content`

---

### 1.5 POST `/upload` *(deprecated)*

Legacy single-shot upload: IDATs + sample sheet in one request, no inspect/preview step. Retained for backwards compatibility; new clients use the two-phase flow above.

- **URL:** `/api/v1/upload` · **Method:** `POST` · **Content-Type:** `multipart/form-data`

#### Request (Form-Data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idat_files` | `File[]` | Yes | Raw IDAT files (stored as-is). |
| `sample_sheet` | `File` | Yes | Sample sheet; canonicalized and stored as `SampleSheet.csv`. |
| `filter_settings` | `string (JSON)` | No | JSON-encoded filter configuration (transmitted as a plain string in the multipart body). |

<a id="filter_settings-structure"></a>
**`filter_settings` structure** (all sub-filters default to disabled/safe):

```json
{
  "det_p": { "enabled": false, "cutoff": 0.01 },
  "bead_count": { "enabled": false, "bead_cutoff": 0.05 },
  "non_cpg": { "enabled": false },
  "snp": { "enabled": false, "maf_cutoff": 0.05 },
  "multi_hit": { "enabled": false },
  "xy_chromosomes": { "enabled": false },
  "sample_quality": {
    "enabled": false,
    "detection_p_cutoff": 0.01,
    "sample_failure_rate": 0.10,
    "remove_failed_samples": true,
    "enable_pca_outlier_detection": true
  }
}
```

Numeric fields are clamped to their valid range by a validator; out-of-range or non-numeric input falls back to the default rather than being rejected.

#### Success Response (201 Created) — `UploadResponse`

Same shape as [1.3](#13-post-uploadcommit).

#### Error Responses

| Status | `type` | When |
|--------|--------|------|
| 400 | `/errors/invalid-filter-json` | `filter_settings` is not valid JSON or is missing the wrapper key. |
| 400 | `/errors/invalid-upload` · `/errors/too-many-samples` | Invalid files, or the cohort exceeds the sample cap. |
| 507 | `/errors/storage-limit-exceeded` | Job-disk budget exhausted. |
| 500 | `/errors/save-failed` | Files could not be saved (partial job dir rolled back). |

---

## 2. Status

**Base Path:** `/api/v1/status`

### 2.1 GET `/status/{job_id}`

Returns the current pipeline state. Polled by the frontend at a fixed interval.

- **URL:** `/api/v1/status/{job_id}` · **Method:** `GET` · **Content-Type:** `application/json`

#### Success Response (200 OK)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "status": "running",
  "phase": "filtering",
  "progress_percent": 65,
  "current_step": "Parsing IDAT files",
  "error": null
}
```

| Field | Description |
|-------|-------------|
| `status` | Global job state. |
| `phase` | Current technical pipeline stage. |
| `progress_percent` | Overall progress 0–100. Monotonically non-decreasing within the pipeline. |
| `current_step` | Human-readable description of the current operation. |
| `error` | Object describing the failure cause, or `null`. |

**`status` values:** `waiting` · `running` · `completed` · `failed`

**`phase` values:** `uploaded` · `filtering` · `normalization_preview` · `normalization` · `svd` · `batch` · `analysis` · `results` · `heatmap`

> Values are the exact lowercase enum values emitted by the backend. The complete state machine (allowed transitions, terminal states, who triggers each transition) is specified in [job-lifecycle.md](./job-lifecycle.md); progress semantics in [pipeline-progress.md](./pipeline-progress.md).

#### Error Responses

**[404 Not Found]:** See [G-404](#g-404-job-not-found).

---

## 3. Filter

**Base Path:** `/api/v1/filter`

### 3.1 GET `/filter/{job_id}/stats`

Returns the statistics produced by the filtering step (`filter_stats.json`): probes removed per filter category and probes remaining.

- **URL:** `/api/v1/filter/{job_id}/stats` · **Method:** `GET` · **Content-Type:** `application/json`

#### Success Response (200 OK)

The body is the `filter_stats.json` file written by `init_filter.R`; its authoritative schema is defined by that script — see [job-directory-layout.md](../contracts/job-directory-layout.md) and the R scripts reference. Representative shape:

```json
{
  "total_probes_before": 866091,
  "total_probes_after": 798234,
  "removed": 67857,
  "steps": [
    { "name": "Detection P-Value", "removed": 12847, "remaining": 853244 },
    { "name": "SNP", "removed": 856, "remaining": 852388 }
  ]
}
```

#### Error Responses

**[404 Not Found]:** See [G-404](#g-404-job-not-found).

**[409 Conflict] — Filtering Not Finished** (`/errors/filtering-not-finished`)

Returned while filtering is still in progress, has failed, or the stats file is not yet available.

```json
{
  "type": "/errors/filtering-not-finished",
  "title": "Filtering not finished",
  "status": 409,
  "detail": "Filter statistics are not available yet.",
  "instance": "/api/v1/filter/4a7b9c12-…/stats",
  "current_phase": "filtering",
  "current_status": "running"
}
```

---

## 4. Normalization Preview

**Base Path:** `/api/v1/preview/normalization`

### 4.1 GET `/preview/normalization/{job_id}`

Returns, per normalization method, the URL of the server-rendered **density** plot and the **PCA** data inlined as JSON (the frontend renders PCA interactively).

- **URL:** `/api/v1/preview/normalization/{job_id}` · **Method:** `GET` · **Content-Type:** `application/json`

#### Success Response (200 OK)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "methods": [
    {
      "method": "raw",
      "density_url": "/api/v1/preview/normalization/4a7b9c12-…/density_raw.png",
      "pca": { "points": [ { "sample": "HeLa", "pc1": 1.2, "pc2": -0.4 } ] }
    },
    {
      "method": "funnorm",
      "density_url": "/api/v1/preview/normalization/4a7b9c12-…/density_funnorm.png",
      "pca": { "points": [] }
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `methods[].method` | Normalization method key (`raw`, `noob`, `quantile`, `swan`, `funnorm`). |
| `methods[].density_url` | URL of the density PNG (fetch via [4.2](#42-get-previewnormalizationjob_idplot_name)); `null` if not produced. |
| `methods[].pca` | Inlined PCA payload for the interactive plot; `null` if not produced. |

#### Error Responses

**[404 Not Found]** — job unknown (`JOB_NOT_FOUND`), or the preview manifest does not exist yet (`PREVIEW_NOT_READY`).

**[409 Conflict] — Preview Not Ready** — the job exists but has not reached a completed preview.

```json
{ "detail": { "error": "PREVIEW_NOT_READY", "message": "Normalization preview not available yet", "current_phase": "filtering", "current_status": "running" } }
```

> The preview endpoints predate full RFC 9457 adoption and return a simplified `{ "error", "message" }` detail body rather than the standard problem shape.

---

### 4.2 GET `/preview/normalization/{job_id}/{plot_name}`

Serves a server-rendered density plot as a binary image.

- **URL:** `/api/v1/preview/normalization/{job_id}/{plot_name}` · **Method:** `GET` · **Content-Type:** `image/png` or `application/pdf`

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | `string (UUID)` | The job. |
| `plot_name` | `string` | Density plot filename. Must begin with `density_` and end in `.png` or `.pdf`. |

> Only density plots are served here; PCA is delivered inline by [4.1](#41-get-previewnormalizationjob_id). Method keys: `raw`, `noob`, `quantile`, `swan`, `funnorm`.

#### Error Responses

- **[400 Bad Request]** — `plot_name` is not an allowed `density_*` name or is traversal-unsafe (`"Invalid plot name"`).
- **[404 Not Found]** — the job or the requested file does not exist.

---

## 5. Normalization

**Base Path:** `/api/v1/normalize`

### 5.1 POST `/normalize/{job_id}`

Runs the final normalization with the method chosen in the preview step, then generates the round-0 SVD plot. Runs asynchronously.

- **URL:** `/api/v1/normalize/{job_id}` · **Method:** `POST` · **Content-Type:** `application/json`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | `string` | Yes | Allowed: `noob`, `quantile`, `swan`, `funnorm`, `raw`. |

#### Success Response (202 Accepted)

```json
{ "job_id": "4a7b9c12-…", "status": "running", "method": "funnorm" }
```

> `status` is the global job state (`running`), not the phase; the phase (`normalization` => `svd`) is reported by `/status`.

#### Error Responses

- **[404 Not Found]:** See [G-404](#g-404-job-not-found).
- **[409 Conflict]:** See [G-409](#g-409-invalid-state-transition).
- **[400 Bad Request] — Invalid Normalization Method** (`/errors/invalid-normalization-method`)

```json
{
  "type": "/errors/invalid-normalization-method",
  "title": "Invalid normalization method",
  "status": 400,
  "detail": "Invalid method 'unknown_method'. Allowed: noob, quantile, swan, funnorm, raw.",
  "instance": "/api/v1/normalize/4a7b9c12-…"
}
```

---

## 6. Batch Correction

**Base Path:** `/api/v1/batch`

Identifies and corrects batch effects in normalized data using SVD diagnostics and correction. The process can iterate across rounds or be skipped, after which the DMP/DMR downstream analysis runs.

---

### 6.1 GET `/{job_id}/batch-options`

Returns the sample-sheet columns eligible as a **batch variable** or **covariate**. A column is eligible if it groups the samples: it has at least two distinct values and fewer than one per sample (a per-sample identifier groups nothing). No column name is hard-coded — the biologist assigns roles; the endpoint is permissive.

- **URL:** `/api/v1/batch/{job_id}/batch-options` · **Method:** `GET`

#### Success Response (200 OK) — `BatchOptionsResponse`

```json
{
  "job_id": "4a7b9c12-…",
  "columns": [
    { "name": "Sample_Group", "levels": 2, "values": ["Cellline", "Coriell"] },
    { "name": "Array_Batch",  "levels": 3, "values": ["B1", "B2", "B3"] }
  ],
  "available_columns": ["Sample_Group", "Array_Batch"]
}
```

| Field | Description |
|-------|-------------|
| `columns[]` | Eligible columns with `name`, distinct-value count (`levels`), and the distinct `values`. |
| `available_columns` | Backwards-compatible flat list of the same column names. |

#### Error Responses

- **[404 Not Found]:** See [G-404](#g-404-job-not-found), or `/errors/sample-sheet-not-found` if `SampleSheet.csv` is missing.

---

### 6.2 GET `/{job_id}/sample-sheet`

Tabular preview of the job's sample sheet, so the frontend can present the columns for role assignment (batch variable, covariates, comparison groups).

- **URL:** `/api/v1/batch/{job_id}/sample-sheet` · **Method:** `GET`

#### Success Response (200 OK) — `SampleSheetPreviewResponse`

```json
{ "job_id": "4a7b9c12-…", "columns": ["Sample_Name", "Sample_Group", "…"], "rows": [["HeLa", "Cellline", "…"]], "total_rows": 8, "truncated": false }
```

---

### 6.3 GET `/{job_id}/history`

Full history of batch-correction rounds. Round 0 is the initial SVD after normalization, before any correction.

- **URL:** `/api/v1/batch/{job_id}/history` · **Method:** `GET`

#### Success Response (200 OK) — `BatchHistoryResponse`

```json
{
  "job_id": "4a7b9c12-…",
  "current_round": 1,
  "correction_applied": true,
  "rounds": [
    { "round": 0, "type": "initial", "svd_plot": "svd_plot_0.png", "settings_used": null, "timestamp": "2026-07-08T15:30:00Z" },
    {
      "round": 1, "type": "correction", "svd_plot": "svd_plot_1.png",
      "settings_used": { "batch_variable": "Array_Batch", "covariates": ["Sample_Group", "Age"] },
      "timestamp": "2026-07-08T15:45:00Z"
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `current_round` | Index of the most recent round. |
| `correction_applied` | `true` once at least one correction has run. |
| `rounds[].svd_plot` | SVD plot filename for the round — retrieve via [6.4](#64-get-job_idsvd-plotround_id). |
| `rounds[].settings_used` | `null` for round 0; otherwise `{ batch_variable, covariates[] }`. |

#### Error Responses

**[404 Not Found]:** See [G-404](#g-404-job-not-found).

---

### 6.4 GET `/{job_id}/svd-plot/{round_id}`

Serves the SVD plot for a round.

- **URL:** `/api/v1/batch/{job_id}/svd-plot/{round_id}` · **Method:** `GET`

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `string` | `png` | `png` (inline raster, `image/png`) or `pdf` (vector download, `application/pdf`). |

#### Error Responses

**[404 Not Found]** — job unknown (`JOB_NOT_FOUND`) or the plot for that round does not exist (`/errors/plot-not-found`).

---

### 6.5 POST `/{job_id}`

Starts a new batch-correction round in the background; the next round number (n+1) is derived from the history. Round 0 is not created here.

- **URL:** `/api/v1/batch/{job_id}` · **Method:** `POST` · **Content-Type:** `application/json`

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `batch_correction.batch_variable` | `string` | Yes | Technical variable to remove (any grouping column). |
| `batch_correction.covariates` | `string[]` | No | Biological covariates to preserve. Defaults to `[]`. |

```json
{ "batch_correction": { "batch_variable": "Array_Batch", "covariates": ["Sample_Group", "Age"] } }
```

#### Success Response (202 Accepted) — `BatchRunResponse`

```json
{ "job_id": "4a7b9c12-…", "status": "running", "round": 2 }
```

#### Error Responses

| Status | `type` | When |
|--------|--------|------|
| 400 | `/errors/invalid-batch-variable` | `batch_variable` is not an eligible sample-sheet column. |
| 400 | `/errors/invalid-covariate` | A covariate is not an eligible column. |
| 400 | `/errors/covariate-equals-batch` | The batch variable also appears in the covariates. |
| 409 | `/errors/batch-not-allowed` | A pipeline is already running for this job. |
| 404 | `/errors/job-not-found` | See [G-404](#g-404-job-not-found). |

---

### 6.6 POST `/{job_id}/skip`

Proceeds to the DMP/DMR downstream analysis using the data in its current state (either the batch-corrected matrix, or the uncorrected normalized data if no correction was applied).

- **URL:** `/api/v1/batch/{job_id}/skip` · **Method:** `POST` · **Content-Type:** `application/json`

#### Request Body — `AnalysisStartRequest` (optional)

Carries the comparison-group selection made on the batch page, so Δβ is deterministic (`mean(case) − mean(control)`). All fields optional; if omitted, R falls back to auto-detecting a two-level column.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `group_column` | `string` | No | Sample-sheet column defining the comparison. |
| `case_group` | `string` | No | Value in `group_column` treated as *case*. |
| `control_group` | `string` | No | Value in `group_column` treated as *control*. |

```json
{ "group_column": "Sample_Group", "case_group": "Cellline", "control_group": "Coriell" }
```

#### Success Response (202 Accepted) — `BatchSkipResponse`

```json
{ "job_id": "4a7b9c12-…", "status": "running" }
```

#### Error Responses

| Status | `type` | When |
|--------|--------|------|
| 400 | `/errors/invalid-batch-variable` | `group_column` is not an available column. |
| 400 | `/errors/invalid-selection` | `case_group == control_group`, or a value is not present in the column. |
| 404 | `/errors/job-not-found` | See [G-404](#g-404-job-not-found). |

---

## 7. Table

**Base Path:** `/api/v1/table`

Paginated, sortable, filterable access to the DMP/DMR result tables, plus full CSV export. Tables are **keep-all-rows**: significance is a client-controlled filter, never a server-side cull.

The complete filter contract — every frontend field, its `filter_*` query parameter, the backend operator, and the target R/CSV column — is specified in [filter-mapping.md](../contracts/filter-mapping.md) and is **not** duplicated here.

---

### 7.1 GET `/table/{job_id}/{table}`

Returns a paginated, sorted, filtered page of a result table. Filters are supplied as `filter_<key>` query parameters (e.g. `?filter_chr=chr1&filter_gene=BRCA1`).

- **URL:** `/api/v1/table/{job_id}/{table}` · **Method:** `GET`

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `job_id` | `string (UUID)` | The job. |
| `table` | `string` | `dmp` or `dmr`. |

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | 1-based page number (≥ 1); page size is 75. |
| `sort_by` | `string` | `null` | Column to sort by; defaults to `cpg_id` where present. |
| `sort_order` | `string` | `null` | `asc` or `desc`. |
| `filter_<key>` | variable | — | Column filters; see [filter-mapping.md](../contracts/filter-mapping.md). |

#### Success Response (200 OK)

```json
{
  "table": "dmp",
  "table_title": "DMP",
  "columns": [ { "key": "cpg_id", "label": "cpg_id", "type": "string", "sortable": true, "filterable": true } ],
  "pagination": { "page": 1, "page_size": 75, "total_rows": 12450, "total_pages": 166 },
  "data": [ { "cpg_id": "cg00000029", "CHR": "chr16", "…": "…" } ]
}
```

#### Error Responses

| Status | Meaning | When |
|--------|---------|------|
| 404 | Job not found | Unknown job. |
| 400 | Invalid table | `table` is not `dmp`/`dmr`. |
| 400 | Invalid sort column / order (`/errors/invalid-sort-column`, `/errors/invalid-sort-order`) | Bad `sort_by`/`sort_order`. |
| 400 | Invalid filter value (`/errors/invalid-parameter`) | A numeric filter received a non-numeric value. |
| 409 | Data not ready | The result CSV has not been produced yet. |

> The table module's *job-not-found* / *invalid-table* / *not-ready* responses use a simplified `{ "error", "message" }` detail body; its sort/filter errors use the standard RFC 9457 shape.

---

### 7.2 GET `/table/{job_id}/{table}/export`

Exports the complete, untruncated table as CSV, honouring the current sort and filters. No pagination.

- **URL:** `/api/v1/table/{job_id}/{table}/export` · **Method:** `GET` · **Content-Type:** `text/csv`

Query parameters (`sort_by`, `sort_order`, `filter_<key>`) behave as in [7.1](#71-get-tablejob_idtable).

Response headers:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="{table}_{job_id}_export.csv"
```

Errors: identical to [7.1](#71-get-tablejob_idtable).

---

## 8. Heatmap

**Base Path:** `/api/v1/heatmap`

Generates a heatmap of the differentially methylated positions selected by the **same filter** the DMP table view uses (a single filter source), grouped by sample-sheet annotations.

---

### 8.1 GET `/{job_id}/options`

Returns the sample-sheet columns offered as heatmap annotations. Permissive: **every** column with at least one non-empty value is returned, each with a type hint so the frontend can render it appropriately.

- **URL:** `/api/v1/heatmap/{job_id}/options` · **Method:** `GET`

#### Success Response (200 OK) — `HeatmapOptionsResponse`

```json
{
  "job_id": "4a7b9c12-…",
  "available_columns": [
    { "name": "Sample_Group", "type": "categorical", "n_distinct": 2 },
    { "name": "Sample_Name",  "type": "identifier",  "n_distinct": 8 }
  ]
}
```

| Field | Description |
|-------|-------------|
| `available_columns[].type` | `categorical` (discrete colours) · `continuous` (gradient) · `identifier` (one value per sample). |
| `available_columns[].n_distinct` | Number of distinct values in the column. |

#### Error Responses

- **[404 Not Found]:** See [G-404](#g-404-job-not-found).
- **[400 Bad Request]** — `/errors/invalid-csv-content` if the sample sheet is missing or cannot be parsed.

---

### 8.2 POST `/{job_id}`

Starts heatmap generation in the background. The CpG selection is decided in the backend by applying the supplied `filters` (the same filter layer as the table) to the DMP results, then rendered grouped by the chosen annotations.

- **URL:** `/api/v1/heatmap/{job_id}` · **Method:** `POST` · **Content-Type:** `application/json`

#### Request Body — `HeatmapRequest`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grouping.primary` | `string` | Yes | Primary annotation column. |
| `grouping.secondary` | `string \| null` | No | Optional secondary annotation; must differ from `primary`. |
| `filters` | `object` | No | Flat `{ key: value }` filter map — the **same keys as the DMP table** (e.g. `chr`, `gene`, `adj_p_value`, `delta_beta`). Applied through the shared filter layer; see [filter-mapping.md](../contracts/filter-mapping.md). Defaults to `{}` (all CpGs). |

```json
{ "grouping": { "primary": "Sample_Group", "secondary": "Gender" }, "filters": { "chr": "chr1", "adj_p_value": "0.05" } }
```

#### Success Response (202 Accepted) — `HeatmapRunResponse`

```json
{
  "job_id": "4a7b9c12-…",
  "phase": "heatmap",
  "status": "running",
  "heatmap_metadata": { "detected_cpgs": 128, "plotted_samples": 0, "message": "Heatmap generation started." }
}
```

`detected_cpgs` is the number of CpGs the filter selected (validated before R starts).

#### Error Responses

| Status | `type` | When |
|--------|--------|------|
| 400 | `/errors/invalid-grouping-column` | A grouping column is absent, or primary == secondary. |
| 400 | `/errors/heatmap-no-cpgs` | The filter selects zero CpGs. |
| 400 | `/errors/heatmap-too-many-cpgs` | The filter selects more than the 500-CpG cap; tighten it. |
| 409 | `/errors/heatmap-not-allowed` | A pipeline is already running for this job. |
| 404 | `/errors/file-not-found` | DMP results are not available yet. |
| 410 | `/errors/session-expired` | See [G-410](#g-410-session-expired). |

---

### 8.3 GET `/{job_id}`

Returns the generated heatmap as an image.

- **URL:** `/api/v1/heatmap/{job_id}` · **Method:** `GET` · **Content-Type:** `image/png` or `application/pdf`

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | `string` | `png` | `png` or `pdf`. |

#### Error Responses

**[404 Not Found] — Heatmap Not Available** (`/errors/plot-not-found`) — the heatmap has not been generated yet (still running, or failed).

```json
{
  "type": "/errors/plot-not-found",
  "title": "SVD plot not found",
  "status": 404,
  "detail": "Heatmap (PNG) for job '4a7b9c12-…' is not available yet.",
  "instance": "/api/v1/heatmap/4a7b9c12-…"
}
```

---

## 9. Reset

**Base Path:** `/api/v1/reset`

### 9.1 POST `/reset/{job_id}`

Cancels any running analysis (terminating the active R subprocess) and **permanently deletes** the job and all its data. The operation is idempotent and concurrency-safe; the success response is only returned once the data has actually been removed from disk. After a reset the client should navigate back to upload to start a new job.

> Effect on data retention (deletion, GDPR) and on running R subprocesses is detailed in [security.md](../backend/security.md) and [job-lifecycle.md](./job-lifecycle.md).

- **URL:** `/api/v1/reset/{job_id}` · **Method:** `POST`
- **Request Body:** None.

#### Success Response (200 OK)

```json
{ "reset": true, "was_running": true, "already_in_progress": false }
```

| Field | Description |
|-------|-------------|
| `reset` | Always `true` on success. |
| `was_running` | `true` if a pipeline was cancelled as part of the reset. |
| `already_in_progress` | `true` if a concurrent reset for this job was already running (this call was a no-op). |

#### Error Responses

**[404 Not Found]:** See [G-404](#g-404-job-not-found) — no job (in memory or on disk) for this id.

**[500 Internal Server Error] — Reset Failed** (`/errors/reset-failed`)

Returned when the job's data could not be fully deleted; the client must treat the data as **not** removed.

```json
{
  "type": "/errors/reset-failed",
  "title": "Reset failed",
  "status": 500,
  "detail": "The data for job '4a7b9c12-…' could not be fully deleted.",
  "instance": "/api/v1/reset/4a7b9c12-…"
}
```
