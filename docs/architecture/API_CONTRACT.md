# MethylAnalyzer — API Contract

**Version:** 1.0  
**Date:** 2026-06-16  
**Base URL:** `/api/v1`  
**Project:** BigTom / MethylAnalyzer (THM)

---

## Table of Contents

- [Error Format](#error-format)
- [Global Errors](#global-errors)
- [1. Upload \& Job Initialization](#1-upload--job-initialization)
- [2. Status](#2-status)
- [3. Filter](#3-filter)
- [4. Normalization Preview](#4-normalization-preview)
- [5. Normalization](#5-normalization)
- [6. Batch Correction](#6-batch-correction)
- [7. Table](#7-table)
- [8. Heatmap](#8-heatmap)
- [9. Reset](#9-reset)

---

## Error Format

All error responses conform to the **Problem Details for HTTP APIs** standard ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)), providing a consistent, machine-readable JSON structure for HTTP errors.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | Yes | Short, human-readable label describing the *class* of error (generic, not instance-specific). |
| `status` | `integer` | Yes | HTTP status code — identical to the status code in the response header. |
| `detail` | `string` | Yes | Detailed, human-readable explanation of this specific error occurrence. |
| `instance` | `string` | Yes | URI/path identifying the affected request or resource (typically the endpoint where the error occurred). |
| `errors` | `array` | No | Optional array of per-field error objects. Use only in validation contexts (e.g., 422 responses). Each object should contain at minimum `field` and `message`. Avoid unless strictly necessary. |

> **Note:** The `type` field defined by RFC 9457 is intentionally omitted — it provides no practical value for this application.

**Example (validation error with `errors` array):**

```json
{
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "instance": "/api/v1/upload",
  "errors": [
    { "field": "email", "message": "Must be a valid email address." },
    { "field": "password", "message": "Must be at least 8 characters long." }
  ]
}
```

---

## Global Errors

These error states are not specific to a single endpoint. They may occur on any API call that uses a `job_id` path parameter.

### G-404: Job Not Found

Returned when the provided `job_id` does not exist in the system.

```json
{
  "title": "Job Not Found",
  "status": 404,
  "detail": "No job found for job_id '4a7b9c12-e832-4fd3-a611-123456789abc'.",
  "instance": "/api/v1/{route}/{job_id}"
}
```

### G-409: Invalid State Transition

Returned when the requested action conflicts with the job's current status or phase (e.g., attempting to start a pipeline step while the job is already `running`).

```json
{
  "title": "Invalid State Transition",
  "status": 409,
  "detail": "The requested action cannot be performed because the job is currently in phase 'normalizing' with status 'running'.",
  "instance": "/api/v1/{route}/{job_id}",
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "current_status": "running",
  "current_phase": "normalizing"
}
```

---

## 1. Upload & Job Initialization

**Base Path:** `/api/v1/upload`

---

### 1.1 POST `/upload`

Initiates a new analysis job by uploading raw IDAT files and the corresponding sample sheet. Filter settings may optionally be included. Processing runs asynchronously in the background.

- **URL:** `/api/v1/upload`
- **Method:** `POST`
- **Content-Type:** `multipart/form-data`

#### Request Parameters (Form-Data)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `idat_files` | `File[]` | Yes | Raw IDAT data files for the analysis. |
| `sample_sheet` | `File` | Yes | Sample sheet as a CSV file (stored internally as `SampleSheet.csv`). |
| `filter_settings` | `string (JSON)` | No | JSON-encoded string containing the filter configuration. See structure below. |

> **Note on `filter_settings`:** Because this is a `multipart/form-data` request, the JSON must be transmitted as a plain string value.

**`filter_settings` JSON structure:**

```json
{
  "det_p": {
    "enabled": false,
    "cutoff": 0.01
  },
  "bead_count": {
    "enabled": false,
    "bead_cutoff": 0.05
  },
  "non_cpg": {
    "enabled": false
  },
  "snp": {
    "enabled": false,
    "maf_cutoff": 0.05
  },
  "multi_hit": {
    "enabled": false
  },
  "xy_chromosomes": {
    "enabled": false
  },
  "sample_quality": {
    "enabled": false,
    "detection_p_cutoff": 0.01,
    "sample_failure_rate": 0.10,
    "remove_failed_samples": true,
    "enable_pca_outlier_detection": true
  }
}
```

> The `filter_settings` JSON example in the previous draft was syntactically malformed (missing opening brace, misplaced string delimiter). Corrected above.

#### Validation Constraints

| Rule | Value |
|------|-------|
| Supported file formats | `.idat`, `.csv`, `.xlsx` |
| Minimum number of IDAT files | 2 (TBD) |
| Typical sample count | ~16 |
| Maximum upload size | 200 MB |

The sample sheet must contain the columns `Sentrix_ID` and `Sentrix_Position`, and the listed samples must match the uploaded IDAT files.

#### Success Response (201 Created)

```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "waiting",
  "filter_settings": {
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
}
```

#### Error Responses

**[400 Bad Request] — Invalid Input**

Returned when the IDAT files, sample sheet, or `filter_settings` JSON are invalid (malformed JSON or filter parameters outside the permitted value range).

```json
{
  "title": "Invalid Filter JSON",
  "status": 400,
  "detail": "Error parsing filter_settings: <error message>",
  "instance": "/api/v1/upload"
}
```

**[500 Internal Server Error] — Save Failed**

Returned when the uploaded files could not be saved correctly on the server.

```json
{
  "title": "Save Failed",
  "status": 500,
  "detail": "Error saving files: <error message>",
  "instance": "/api/v1/upload",
  "job_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
}
```

---

## 2. Status

**Base Path:** `/api/v1/status`

---

### 2.1 GET `/status/{job_id}`

Returns the current state of the analysis pipeline. This endpoint is polled by the frontend at a fixed interval (currently every 1.5 s).

- **URL:** `/api/v1/status/{job_id}`
- **Method:** `GET`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Success Response (200 OK)

> The `error` field was previously shown as a plain string. The OpenAPI schema defines it as `object | null`. Corrected below.

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "status": "running",
  "phase": "FILTERING",
  "progress_percent": 65,
  "current_step": "Parsing IDAT files",
  "error": null
}
```

**Field descriptions:**

| Field | Description |
|-------|-------------|
| `status` | Global job state, used for UI logic. |
| `phase` | Current technical pipeline stage. |
| `progress_percent` | Overall progress from 0 to 100. Monotonically non-decreasing — may jump within a phase, but never regresses. |
| `current_step` | Human-readable description of the current operation (e.g., `"Parsing IDAT files"`). |
| `error` | Object describing the error cause if a failure occurred; `null` otherwise. |

**Allowed `status` values:** `running` · `waiting` · `success` · `failed`

**Allowed `phase` values:** `UPLOAD` · `FILTERING` · `NORMALIZATION_PREVIEW` · `NORMALIZATION` · `SVD` · `BATCH` · `DMP_DMR` · `RESULTS` · `HEATMAP`

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

---

## 3. Filter

>  This section was entirely absent from the previous contract draft. The endpoint `GET /api/v1/filter/{job_id}/stats` is present in the OpenAPI specification (tag: `Filter`) but was not documented. Added here for completeness.

**Base Path:** `/api/v1/filter`

---

### 3.1 GET `/filter/{job_id}/stats`

Returns statistical information about the filtering step applied to the uploaded data, including the number of probes removed by each filter category and the number of remaining probes after filtering.

- **URL:** `/api/v1/filter/{job_id}/stats`
- **Method:** `GET`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Success Response (200 OK)

>  The response schema is listed as `{}` (unspecified) in the OpenAPI spec. The structure below is inferred from the `filter_settings` model and typical bioinformatics filtering output. **Needs confirmation by the backend team.**

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "total_probes_before": 866091,
  "total_probes_after": 798234,
  "filters_applied": {
    "det_p":          { "enabled": true,  "removed": 1234 },
    "bead_count":     { "enabled": false, "removed": 0 },
    "non_cpg":        { "enabled": true,  "removed": 2870 },
    "snp":            { "enabled": true,  "removed": 64753 },
    "multi_hit":      { "enabled": false, "removed": 0 },
    "xy_chromosomes": { "enabled": false, "removed": 0 },
    "sample_quality": { "enabled": false, "removed_samples": 0 }
  }
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[409 Conflict] — Filter Stats Not Ready**

> 

Returned when the filtering step has not yet completed for this job.

```json
{
  "title": "Filter Stats Not Ready",
  "status": 409,
  "detail": "Filtering has not yet completed for job '4a7b9c12-e832-4fd3-a611-123456789abc'.",
  "instance": "/api/v1/filter/4a7b9c12-e832-4fd3-a611-123456789abc/stats"
}
```

---

## 4. Normalization Preview

**Base Path:** `/api/v1/preview/normalization`

>  Renumbered from Section 3 to Section 4 due to insertion of the Filter section.

---

### 4.1 GET `/preview/normalization/{job_id}`

Retrieves structured metadata and endpoint URLs for all generated normalization preview plots. Plots are grouped by normalization method and include the specific plot types available for each (e.g., density, PCA).

- **URL:** `/api/v1/preview/normalization/{job_id}`
- **Method:** `GET`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Success Response (200 OK)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "plots": [
    {
      "method": "raw",
      "plots": [
        {
          "plot_kind": "density",
          "url": "/api/v1/preview/normalization/4a7b9c12-e832-4fd3-a611-123456789abc/density_raw.png"
        },
        {
          "plot_kind": "pca",
          "url": "/api/v1/preview/normalization/4a7b9c12-e832-4fd3-a611-123456789abc/pca_raw.png"
        }
      ]
    },
    {
      "method": "funnorm",
      "plots": [
        {
          "plot_kind": "density",
          "url": "/api/v1/preview/normalization/4a7b9c12-e832-4fd3-a611-123456789abc/density_funnorm.png"
        }
      ]
    }
  ]
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[404 Not Found] — Preview Not Ready**

Returned when the job exists but the R pipeline has not yet finished generating the preview plots.

```json
{
  "title": "Preview Not Ready",
  "status": 404,
  "detail": "Preview plots not yet available.",
  "instance": "/api/v1/preview/normalization/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

---

### 4.2 GET `/preview/normalization/{job_id}/{plot_name}`

Serves the binary PNG image file for a specific normalization preview plot.

- **URL:** `/api/v1/preview/normalization/{job_id}/{plot_name}`
- **Method:** `GET`
- **Content-Type:** `image/png`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |
| `plot_name` | `string` | Yes | Filename of the plot. Must begin with `density_` or `pca_`. |

**Supported `method` key values in plot filenames:**

| Key | Description |
|-----|-------------|
| `raw` | Unprocessed raw data (baseline comparison) |
| `noob` | Normal-exponential out-of-band normalization (minfi) |
| `quantile` | Quantile normalization |
| `swan` | Subset-quantile Within Array Normalization |
| `funnorm` | Functional Normalization (minfi) |

#### Success Response (200 OK)

Response body: Binary image data (PNG format).

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[404 Not Found] — Plot Not Found**

Returned when the requested file does not physically exist in the job's storage path.

```json
{
  "title": "Plot Not Found",
  "status": 404,
  "detail": "Plot not found.",
  "instance": "/api/v1/preview/normalization/4a7b9c12-e832-4fd3-a611-123456789abc/density_missing.png"
}
```

**[400 Bad Request] — Invalid Plot Name**

Returned when `plot_name` does not begin with an allowed prefix (`density_` or `pca_`).

```json
{
  "title": "Invalid Plot Name",
  "status": 400,
  "detail": "Invalid plot name. Filename must begin with 'density_' or 'pca_'.",
  "instance": "/api/v1/preview/normalization/4a7b9c12-e832-4fd3-a611-123456789abc/invalid_file.png"
}
```

---

## 5. Normalization

**Base Path:** `/api/v1/normalize`

>  Renumbered from Section 4 to Section 5.

---

### 5.1 POST `/normalize/{job_id}`

Starts the final normalization of the data based on the normalization method selected by the user in the Normalization Preview step.

- **URL:** `/api/v1/normalize/{job_id}`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `method` | `string` | Yes | Normalization method to apply. Allowed: `noob`, `quantile`, `swan`, `funnorm`, `raw`. |

#### Success Response (202 Accepted)

>  The previous draft used `"status": "normalizing"`, which is not a valid status value. The `status` field reflects the global job state (`running`, `waiting`, `success`, `failed`); the `normalizing` phase is reported separately by the `/status` endpoint. Corrected to `"status": "running"`.

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "status": "running",
  "method": "funnorm"
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[409 Conflict]:** See [G-409: Invalid State Transition](#g-409-invalid-state-transition)

**[400 Bad Request] — Invalid Normalization Method**

Returned when an unsupported normalization method is provided in the request body.

```json
{
  "title": "Invalid Normalization Method",
  "status": 400,
  "detail": "Invalid normalization method 'unknown_method'. Allowed: noob, quantile, swan, funnorm, raw.",
  "instance": "/api/v1/normalize/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

---

## 6. Batch Correction

**Base Path:** `/api/v1/batch`

>  Renumbered from Section 5 to Section 6.

This module enables identification and correction of batch effects (technically induced variances) in normalized data using SVD analyses (singular value decomposition) and correction algorithms (e.g., ComBat). The process can be performed iteratively across multiple rounds or skipped entirely.

---

### 6.1 GET `/{job_id}/batch-options`

Returns all available column headers from the uploaded sample sheet. Used by the frontend to dynamically populate the dropdowns for the batch variable and covariates.

- **URL:** `/api/v1/batch/{job_id}/batch-options`
- **Method:** `GET`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Success Response (200 OK)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "available_columns": ["Sample_Group", "Age", "Gender", "Array_Batch", "Slide_ID"]
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[404 Not Found] — Sample Sheet Not Found**

```json
{
  "title": "Sample Sheet Not Found",
  "status": 404,
  "detail": "The file 'SampleSheet.csv' could not be found in the job directory.",
  "instance": "/api/v1/batch/4a7b9c12-e832-4fd3-a611-123456789abc/batch-options"
}
```

---

### 6.2 GET `/{job_id}/history`

Retrieves the full history of batch correction rounds for a job, including metadata for each completed round. Round 0 is the initial SVD analysis generated directly after normalization, before any correction is applied.

- **URL:** `/api/v1/batch/{job_id}/history`
- **Method:** `GET`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Success Response (200 OK)

>  Field names in `rounds` items were corrected to match the OpenAPI schema: `round` (not `round_number`), `svd_plot` (not `plot_file`), `type` and `settings_used` (not `batch_variable` / `covariates`). The `settings_used` object wraps both `batch_variable` and `covariates` for rounds where correction was applied.
>
>  The `correction_applied` field was present in the OpenAPI schema (`BatchHistoryResponse`) but missing from the previous contract draft.

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "current_round": 1,
  "correction_applied": false,
  "rounds": [
    {
      "round": 0,
      "type": "initial",
      "svd_plot": "svd_plot_0.png",
      "settings_used": null,
      "timestamp": "2026-06-16T15:30:00Z"
    },
    {
      "round": 1,
      "type": "combat",
      "svd_plot": "svd_plot_1.png",
      "settings_used": {
        "batch_variable": "Array_Batch",
        "covariates": ["Sample_Group", "Age"]
      },
      "timestamp": "2026-06-16T15:45:00Z"
    }
  ]
}
```

**Field descriptions:**

| Field | Description |
|-------|-------------|
| `current_round` | Index of the most recent completed round. |
| `correction_applied` | `true` if at least one correction has been applied to the data. |
| `rounds[].round` | Zero-based round index. Round 0 is the initial SVD plot after normalization. |
| `rounds[].type` | Algorithm or round type identifier (e.g., `initial`, `combat`). |
| `rounds[].svd_plot` | Filename of the SVD plot for this round. Retrieve via [6.3 GET `/{job_id}/svd-plot/{round_id}`](#63-get-job_idsvd-plotround_id). |
| `rounds[].settings_used` | Settings applied in this round (`null` for round 0). Contains `batch_variable` (string) and `covariates` (string[]). |

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

---

### 6.3 GET `/{job_id}/svd-plot/{round_id}`

Serves the binary SVD plot image for a specific correction round, enabling visual inspection of remaining associations between principal components and batch variables.

- **URL:** `/api/v1/batch/{job_id}/svd-plot/{round_id}`
- **Method:** `GET`
- **Content-Type:** `image/png`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |
| `round_id` | `integer` | Yes | Round index (≥ 0). |

#### Success Response (200 OK)

Response body: Binary image data (PNG format).

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[404 Not Found] — Plot Not Found**

```json
{
  "title": "Plot Not Found",
  "status": 404,
  "detail": "SVD plot not found for round 2.",
  "instance": "/api/v1/batch/4a7b9c12-e832-4fd3-a611-123456789abc/svd-plot/2"
}
```

---

### 6.4 POST `/{job_id}`

Starts a new batch correction iteration in the background. Automatically derives the next round number (n+1) from the current history. Round 0 is the initial SVD analysis generated directly after normalization; it is not created by this endpoint.

- **URL:** `/api/v1/batch/{job_id}`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `batch_correction` | `object` | Yes | Wrapper object containing the correction configuration for this round. |
| `batch_correction.batch_variable` | `string` | Yes | Primary technical variable (batch) from the sample sheet whose effect is to be removed (e.g., `Array_Batch`). |
| `batch_correction.covariates` | `string[]` | No | List of biological covariates from the sample sheet whose signal must be preserved during correction (e.g., `Sample_Group`, `Age`). Defaults to `[]`. |

```json
{
  "batch_correction": {
    "batch_variable": "Array_Batch",
    "covariates": ["Sample_Group", "Age"]
  }
}
```

#### Success Response (202 Accepted)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "status": "running",
  "round": 2
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[400 Bad Request] — Invalid Batch Variable**

Returned when the specified `batch_variable` does not exist as a column in the sample sheet.

```json
{
  "title": "Invalid Batch Variable",
  "status": 400,
  "detail": "Column 'Wrong_Column' not found in SampleSheet. Available: Sample_Group, Age, Gender, Array_Batch.",
  "instance": "/api/v1/batch/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

**[400 Bad Request] — Covariate Equals Batch Variable**

Returned when the batch variable also appears in the covariates list.

```json
{
  "title": "Covariate Equals Batch Variable",
  "status": 400,
  "detail": "The batch variable cannot be used as a covariate simultaneously. batch_variable: 'Array_Batch', covariates: ['Array_Batch', 'Age'].",
  "instance": "/api/v1/batch/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

**[400 Bad Request] — Workflow Blocked**

Returned when a background operation is already active for this job, preventing concurrent pipeline access.

```json
{
  "title": "Batch Operation Not Allowed",
  "status": 400,
  "detail": "A batch-related workflow is already running for this job.",
  "instance": "/api/v1/batch/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

---

### 6.5 POST `/{job_id}/skip`

Skips all further batch correction and forwards the data in its current state directly to downstream analysis (DMP/DMR).

- **URL:** `/api/v1/batch/{job_id}/skip`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Request Body

None.

#### Success Response (202 Accepted)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "status": "running"
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[400 Bad Request] — Workflow Blocked**

Returned when a background operation is already active for this job.

```json
{
  "title": "Batch Operation Not Allowed",
  "status": 400,
  "detail": "A workflow is already running for this job.",
  "instance": "/api/v1/batch/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

---

## 7. Table

**Base Path:** `/api/v1/table`

>  Renumbered from Section 6 to Section 7. The export endpoint was previously mislabeled as 5.2 — corrected to 7.2.

This module provides performant display and export of large tabular analysis results. To minimize memory usage on the frontend, all table endpoints are fully paginated, sortable, and support dynamic column filtering.

---

### 7.1 GET `/table/{job_id}/{table}`

Returns paginated, sorted, and filtered records from a specific result table. All query parameters not explicitly listed are automatically interpreted as dynamic column filters (e.g., `?chromosome=chr1`).

- **URL:** `/api/v1/table/{job_id}/{table}`
- **Method:** `GET`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |
| `table` | `string` | Yes | Result table type. Allowed: `dmp` or `dmr`. |

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | `integer` | `1` | 1-based page number for pagination (must be ≥ 1). |
| `sort_by` | `string` | `null` | Column name to sort by (e.g., `p_value`, `delta_beta`). If omitted, defaults to `cpg_id` where present. |
| `sort_order` | `string` | `null` | Sort direction. Allowed: `asc` or `desc`. |
| `{column_name}` | variable | `null` | Dynamic filter: any valid column name can be used as a query parameter for server-side row filtering. |

#### Success Response (200 OK)

```json
{
  "pagination": {
    "page": 1,
    "page_size": 50,
    "total_rows": 12450,
    "total_pages": 249
  },
  "columns": [
    { "name": "cpg_id",           "type": "string" },
    { "name": "chromosome",       "type": "string" },
    { "name": "position",         "type": "integer" },
    { "name": "p_value",          "type": "float" },
    { "name": "beta_difference",  "type": "float" }
  ],
  "data": [
    {
      "cpg_id": "cg00000029",
      "chromosome": "chr16",
      "position": 53468112,
      "p_value": 0.000241,
      "beta_difference": -0.142
    },
    {
      "cpg_id": "cg00000165",
      "chromosome": "chr1",
      "position": 912455,
      "p_value": 0.001852,
      "beta_difference": 0.221
    }
  ]
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[400 Bad Request] — Invalid Table Type**

```json
{
  "title": "Invalid Table Type",
  "status": 400,
  "detail": "Invalid table: 'unknown_table'. Only 'dmp' or 'dmr' are allowed.",
  "instance": "/api/v1/table/4a7b9c12-e832-4fd3-a611-123456789abc/unknown_table"
}
```

**[400 Bad Request] — Invalid Sort Column or Direction**

Returned when sorting by a non-existent column or an invalid direction is specified.

```json
{
  "title": "Invalid Sort Column",
  "status": 400,
  "detail": "Invalid sort column: 'non_existing_column'.",
  "instance": "/api/v1/table/4a7b9c12-e832-4fd3-a611-123456789abc/dmp"
}
```

**[409 Conflict] — Data Not Ready**

Returned when the job exists but the R pipeline has not yet produced result CSV files.

```json
{
  "title": "Analysis Data Not Ready",
  "status": 409,
  "detail": "Analysis data is not yet available because the downstream computation is still running.",
  "instance": "/api/v1/table/4a7b9c12-e832-4fd3-a611-123456789abc/dmp"
}
```

---

### 7.2 GET `/table/{job_id}/{table}/export`

Exports the complete, untruncated dataset as a native CSV file for download, respecting the current sort and filter configuration. No pagination is applied.

- **URL:** `/api/v1/table/{job_id}/{table}/export`
- **Method:** `GET`
- **Content-Type:** `text/csv`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |
| `table` | `string` | Yes | Result table type. Allowed: `dmp` or `dmr`. |

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sort_by` | `string` | `null` | Column name to sort by. |
| `sort_order` | `string` | `null` | Sort direction. Allowed: `asc` or `desc`. |
| `{column_name}` | variable | `null` | Dynamic column filters (same behavior as [7.1](#71-get-tablejob_idtable)). |

#### Success Response (200 OK)

Response body: Raw CSV-formatted string (comma-separated, including header row).

Response headers:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="{table}_{job_id}_export.csv"
```

#### Error Responses

Identical to [7.1 GET `/table/{job_id}/{table}`](#71-get-tablejob_idtable).

---

## 8. Heatmap

**Base Path:** `/api/v1/heatmap`

>  Renumbered from Section 7 to Section 8. Previous subsection numbering was inconsistent (7.1, 6.2, 6.3) — corrected to 8.1, 8.2, 8.3.

This module enables heatmap generation based on DMP results. The heatmap visualizes methylation patterns of differentially methylated positions (DMPs), grouped by biological features from the sample sheet.

---

### 8.1 GET `/{job_id}/options`

Returns all sample sheet columns suitable for heatmap grouping. A column qualifies if it contains at least 2 distinct values (levels), is not unique (appears in at most 50% of samples), and is not a technical identifier (e.g., `Sentrix_ID`).

- **URL:** `/api/v1/heatmap/{job_id}/options`
- **Method:** `GET`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Success Response (200 OK)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "available_columns": [
    "Sample_Group",
    "Age_Group",
    "Gender",
    "Disease_Status"
  ]
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[404 Not Found] — Sample Sheet Not Found**

```json
{
  "title": "Sample Sheet Not Found",
  "status": 404,
  "detail": "The file 'SampleSheet.csv' could not be found in the job directory.",
  "instance": "/api/v1/heatmap/4a7b9c12-e832-4fd3-a611-123456789abc/options"
}
```

**[404 Not Found] — DMP Results Not Available**

```json
{
  "title": "DMP Results Not Found",
  "status": 404,
  "detail": "DMP results for this job are not yet available. Please run the downstream analysis first.",
  "instance": "/api/v1/heatmap/4a7b9c12-e832-4fd3-a611-123456789abc/options"
}
```

---

### 8.2 POST `/{job_id}`

Starts heatmap generation in the background. The heatmap is based on DMP results and groups samples according to the specified sample sheet columns. Generation runs asynchronously.

- **URL:** `/api/v1/heatmap/{job_id}`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `grouping` | `object` | Yes | Grouping configuration for the heatmap. |
| `grouping.primary` | `string` | Yes | Primary grouping column from the sample sheet. |
| `grouping.secondary` | `string \| null` | No | Optional secondary grouping column. Must differ from `grouping.primary`. |
| `dmp_filter` | `object \| null` | No | Optional filter to restrict which DMPs are included. See `DmpFilterPayload` below. |

**`DmpFilterPayload` fields:**

>  The `DmpFilterPayload` schema existed in the OpenAPI spec but was not documented as a field table in the previous contract draft.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dmr_id` | `string \| null` | No | Filter by a specific DMR ID. |
| `chromosome` | `string \| null` | No | Filter by chromosome (e.g., `chr19`). |
| `start` | `integer \| null` | No | Genomic start position (inclusive). |
| `stop` | `integer \| null` | No | Genomic end position (inclusive). |
| `p_value_max` | `float \| null` | No | Maximum p-value threshold. Range: 0.0–1.0. |
| `adj_p_value_max` | `float \| null` | No | Maximum adjusted p-value threshold. Range: 0.0–1.0. |
| `delta_beta_min` | `float \| null` | No | Minimum delta-beta value. Range: -1.0–1.0. |
| `delta_beta_max` | `float \| null` | No | Maximum delta-beta value. Range: -1.0–1.0. |

All `DmpFilterPayload` fields are optional — unset fields are ignored.

**Example request body:**

```json
{
  "grouping": {
    "primary": "Sample_Group",
    "secondary": "Gender"
  },
  "dmp_filter": {
    "chromosome": "chr1",
    "p_value_max": 0.05,
    "delta_beta_min": 0.2
  }
}
```

#### Success Response (202 Accepted)

```json
{
  "job_id": "4a7b9c12-e832-4fd3-a611-123456789abc",
  "phase": "heatmap",
  "status": "running",
  "heatmap_metadata": {
    "detected_cpgs": 0,
    "plotted_samples": 0,
    "message": "Heatmap generation started."
  }
}
```

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[409 Conflict]:** See [G-409: Invalid State Transition](#g-409-invalid-state-transition)

**[400 Bad Request] — Invalid Grouping Column**

Returned when the specified column does not exist in the sample sheet or is not eligible for grouping.

```json
{
  "title": "Invalid Grouping Column",
  "status": 400,
  "detail": "Primary grouping column 'Invalid_Column' not found in SampleSheet. Available: Sample_Group, Age_Group, Gender.",
  "instance": "/api/v1/heatmap/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

**[400 Bad Request] — Identical Grouping Columns**

```json
{
  "title": "Invalid Grouping Column",
  "status": 400,
  "detail": "Primary and secondary grouping columns must not be identical.",
  "instance": "/api/v1/heatmap/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

**[404 Not Found] — DMP Results Not Available**

```json
{
  "title": "DMP Results Not Found",
  "status": 404,
  "detail": "DMP results for this job are not yet available. Please run the downstream analysis first.",
  "instance": "/api/v1/heatmap/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

---

### 8.3 GET `/{job_id}`

Returns the generated heatmap as a binary PNG image file.

- **URL:** `/api/v1/heatmap/{job_id}`
- **Method:** `GET`
- **Content-Type:** `image/png`

> The previous draft listed the success response status as `202 Accepted`. A GET request returning binary content must return `200 OK`. Corrected.

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Success Response (200 OK)

Response body: Binary image data (PNG format).

#### Error Responses

**[404 Not Found]:** See [G-404: Job Not Found](#g-404-job-not-found)

**[404 Not Found] — Heatmap Not Available**

Returned when the heatmap has not yet been generated (pipeline still running or failed).

```json
{
  "title": "Plot Not Found",
  "status": 404,
  "detail": "Heatmap for job '4a7b9c12-e832-4fd3-a611-123456789abc' is not yet available.",
  "instance": "/api/v1/heatmap/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

---

## 9. Reset

**Base Path:** `/api/v1/reset`

> Renumbered from Section 8 to Section 9.

---

### 9.1 POST `/reset/{job_id}`

Cancels a running analysis and terminates the active R process.

> The OpenAPI description states the job is *deleted* on reset and the frontend should navigate back to the upload page to create a new job. The previous contract draft stated the session (files, `job_id`) is *preserved* with `status` set to `canceled`. **This must be resolved by the team.** The success response below reflects the previous draft (session preserved) pending clarification.

- **URL:** `/api/v1/reset/{job_id}`
- **Method:** `POST`
- **Content-Type:** `application/json`

#### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `job_id` | `string (UUID)` | Yes | Unique ID of the analysis job. |

#### Request Body

None.

#### Success Response (200 OK)

```json
{
  "reset": true,
  "status": "canceled"
}
```

#### Error Responses

**[404 Not Found] — Job Not Found**

```json
{
  "title": "Job Not Found",
  "status": 404,
  "detail": "No job found for job_id '4a7b9c12-e832-4fd3-a611-123456789abc'.",
  "instance": "/api/v1/reset/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

**[409 Conflict] — Job Cannot Be Canceled**

Returned when the job is already in a terminal state (`completed`, `canceled`, or `failed`).

```json
{
  "title": "Job Cannot Be Canceled",
  "status": 409,
  "detail": "Job is already in state 'completed' and cannot be canceled.",
  "instance": "/api/v1/reset/4a7b9c12-e832-4fd3-a611-123456789abc"
}
```

---

*MethylAnalyzer API Contract — BigTom / THM — 2026-06-16*