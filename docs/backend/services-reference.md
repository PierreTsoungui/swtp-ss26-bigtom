# Reference: Backend Services

**Scope:** `backend/app/services/` — every module in the service layer of the FastAPI application.

> This document is the **authoritative per-module reference** for the service layer. It covers public APIs, file-system side effects, exceptions, and inter-service dependencies. Architectural context — layering rules, the async execution model, the state machine, resource governance — belongs to [backend-architecture.md](../architecture/backend-architecture.md) and is not repeated here; use that document as the entry point and this one as the lookup.

---

## Table of Contents

- [1. Purpose](#1-purpose)
- [2. Scope and Non-Scope](#2-scope-and-non-scope)
- [3. Module Groups at a Glance](#3-module-groups-at-a-glance)
- [4. Infrastructure Services](#4-infrastructure-services)
  - [4.1 job\_manager](#41-job_manager)
  - [4.2 job\_paths](#42-job_paths)
  - [4.3 pipeline\_task](#43-pipeline_task)
  - [4.4 pipeline\_outcome](#44-pipeline_outcome)
  - [4.5 reset\_service](#45-reset_service)
  - [4.6 job\_cleanup\_service](#46-job_cleanup_service)
- [5. Domain / IO Helpers](#5-domain--io-helpers)
  - [5.1 file\_handler](#51-file_handler)
  - [5.2 archive\_utils](#52-archive_utils)
  - [5.3 staging\_manager](#53-staging_manager)
  - [5.4 samplesheet\_normalizer](#54-samplesheet_normalizer)
  - [5.5 samplesheet\_parser](#55-samplesheet_parser)
  - [5.6 intake\_guards](#56-intake_guards)
  - [5.7 table\_filter](#57-table_filter)
  - [5.8 table\_handler](#58-table_handler)
- [6. Pipeline Orchestration Services](#6-pipeline-orchestration-services)
  - [6.1 upload\_inspect\_service](#61-upload_inspect_service)
  - [6.2 upload\_commit\_service](#62-upload_commit_service)
  - [6.3 upload\_service](#63-upload_service)
  - [6.4 normalize\_service](#64-normalize_service)
  - [6.5 normalization\_preview\_service](#65-normalization_preview_service)
  - [6.6 batch\_service](#66-batch_service)
  - [6.7 heatmap\_service](#67-heatmap_service)
- [7. Error Model](#7-error-model)
- [8. Extension Points](#8-extension-points)
- [9. Cross-links](#9-cross-links)

---

## 1. Purpose

The service layer holds all business logic that would otherwise have to live in routes or R scripts. Routes are thin HTTP adapters; services own the decision-making: what to validate, which state transitions to make, which R command to run, which files to read or write. This document pins the public contract of each module so that a developer can add, change, or test a service without reading its full implementation.

---

## 2. Scope and Non-Scope

**In scope:** every module under `backend/app/services/`, its public functions, accepted arguments, return types, file-system side effects, and exceptions.

**Out of scope:** the layering rules and dependency direction (→ [backend-architecture.md §4](../architecture/backend-architecture.md#4-layered-architecture)); the job state machine and transition graph (→ [job-lifecycle.md](../architecture/job-lifecycle.md)); the R executor mechanics and progress contract (→ [r-executor.md](../architecture/r-executor.md)); the filter key/operator catalogue (→ [filter-mapping.md](../contracts/filter-mapping.md)); the canonical sample-sheet format (→ [samplesheet-spec.md](../contracts/samplesheet-spec.md)); the job artifact file contract (→ [job-directory-layout.md](../contracts/job-directory-layout.md)).

---

## 3. Module Groups at a Glance

Services fall into three conceptual groups that reflect their position in the dependency chain.

| Group | Modules | Depends on |
|---|---|---|
| **Infrastructure** | `job_manager`, `job_paths`, `pipeline_task`, `pipeline_outcome`, `reset_service`, `job_cleanup_service` | `core/` only |
| **Domain / IO helpers** | `file_handler`, `archive_utils`, `staging_manager`, `samplesheet_normalizer`, `samplesheet_parser`, `intake_guards`, `table_filter`, `table_handler` | `core/` and (at most) other domain helpers |
| **Pipeline orchestration** | `upload_inspect_service`, `upload_commit_service`, `upload_service`, `normalize_service`, `normalization_preview_service`, `batch_service`, `heatmap_service` | Infrastructure + domain helpers + `r_executor/` |

The dependency rule is strict: orchestration may depend on infrastructure and domain helpers; domain helpers may depend on infrastructure; infrastructure depends only on `core/`. No layer may depend on an orchestration service. The `r_executor/` subpackage is the single point of contact between the service layer and the R worker container; all other services route R execution through it.

---

## 4. Infrastructure Services

### 4.1 `job_manager`

**Responsibility.** In-memory job registry and state machine. The single source of truth for every job's `(phase, status)`, progress metadata, cancel events, and active pipeline tasks. Nothing else mutates job state.

**Public API**

| Function | Signature | Returns | Notes |
|---|---|---|---|
| `create_job` | `(job_id: str) -> JobStatus` | `JobStatus` | Registers a new job in `UPLOADED / WAITING`. |
| `transition_job` | `(job_id, new_phase, new_status, *, progress_percent?, current_step?, error?) -> JobStatus \| None` | `JobStatus` or `None` | Validates the move against the allowed-transition graph. Raises `InvalidTransitionError` on an illegal move. Returns `None` if the job is being reset (silent no-op). |
| `set_progress` | `(job_id: str, percent: int, message: str) -> JobStatus \| None` | `JobStatus` or `None` | Updates the running job's progress without a phase change. Returns `None` on reset (silent no-op). |
| `get_job` | `(job_id: str) -> JobStatus \| None` | `JobStatus` or `None` | Returns the current record or `None` if unknown. |
| `delete_job` | `(job_id: str) -> bool` | `bool` | Removes the job from the registry. |
| `register_cancel_event` | `(job_id: str, event: asyncio.Event)` | — | Called exclusively by `pipeline_task`. |
| `unregister_cancel_event` | `(job_id: str)` | — | Called exclusively by `pipeline_task`. |
| `get_cancel_event` | `(job_id: str) -> asyncio.Event \| None` | `asyncio.Event` or `None` | |
| `trigger_cancel` | `(job_id: str) -> bool` | `bool` | Sets the cancel event; returns `True` if a signal was sent. |
| `register_job_task` | `(job_id: str, task: asyncio.Task)` | — | Called exclusively by `pipeline_task`. |
| `unregister_job_task` | `(job_id: str)` | — | Called exclusively by `pipeline_task`. |
| `get_job_task` | `(job_id: str) -> asyncio.Task \| None` | `asyncio.Task` or `None` | |
| `begin_reset` | `(job_id: str) -> bool` | `bool` | Claims the exclusive reset slot; returns `False` if already active. |
| `end_reset` | `(job_id: str)` | — | Releases the reset slot. |
| `is_resetting` | `(job_id: str) -> bool` | `bool` | |

**Exceptions.** `InvalidTransitionError` (HTTP 409) on a disallowed state transition. `JobSessionExpiredError` (HTTP 410) when the registry has no record for a job whose directory still exists on disk.

**File I/O.** None. State lives entirely in memory.

**Dependencies.** `core/exceptions`, `core/error_types`.

---

### 4.2 `job_paths`

**Responsibility.** Central job-directory resolution. Provides a single, path-safe `JOBS_DIR / job_id` lookup used by every service that reads or writes job artifacts.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `validate_job_id` | `(job_id: str) -> str` | Validated `job_id` string. Raises `AppException(JOB_NOT_FOUND)` if the id is not a safe path segment. |
| `resolve_job_dir` | `(base_dir: Path, job_id: str) -> Path` | `base_dir / job_id`. Raises `AppException(JOB_NOT_FOUND)` if the directory does not exist. |
| `get_job_dir_or_404` | `(job_id: str) -> Path` | `JOBS_DIR / job_id`. Raises `AppException(JOB_NOT_FOUND)` if not found. |

**Exceptions.** `AppException(JOB_NOT_FOUND)` (HTTP 404).

**File I/O.** Read-only: checks whether the job directory exists.

**Dependencies.** `core/config` (for `JOBS_DIR`), `core/error_types`.

---

### 4.3 `pipeline_task`

**Responsibility.** Central lifecycle owner for every background pipeline task. Creates the `asyncio.Event`, registers it with `job_manager`, runs the pipeline coroutine, and guarantees cleanup in `finally`. No service or route may bypass this.

**Type alias**

```python
PipelineFactory = Callable[[asyncio.Event], Awaitable[None]]
```

**Public API**

| Function | Signature | Returns | Notes |
|---|---|---|---|
| `start_job_pipeline` | `(job_id: str, pipeline_factory: PipelineFactory) -> asyncio.Task` | `asyncio.Task` | Creates and schedules the background task. Used by routes that call `BackgroundTasks.add_task`. |
| `run_job_pipeline` | `async (job_id: str, pipeline_factory: PipelineFactory) -> None` | — | Awaitable entry point; calls `start_job_pipeline` and awaits the result. |

**Exceptions.** None raised to the caller. Unhandled exceptions inside the pipeline coroutine are logged.

**File I/O.** None.

**Dependencies.** `job_manager` (event and task registration).

---

### 4.4 `pipeline_outcome`

**Responsibility.** Shared translation of a finished R step's `ExecutionResult` into a standardized cancel / timeout / failure state transition. Ensures all pipeline steps respond identically to the same condition.

**Public API**

| Symbol | Kind | Description |
|---|---|---|
| `StepOutcome` | `Enum` | `SUCCESS`, `CANCELLED`, `TIMEOUT`, `FAILED`. |
| `progress_fields` | `(data: dict) -> tuple[int, str]` | Extracts `(percent, message)` from an R progress event dict. |
| `failure_detail` | `(result: ExecutionResult, fallback: str) -> str` | Returns the best human-readable failure reason from an R result. |
| `handle_step_result` | `(job_id, result, *, phase, fallback, timeout_step, failure_step, timeout_detail?, cancel_log?) -> StepOutcome` | Applies the cancel / timeout / failure policy and performs the corresponding `job_manager` transition. Returns the outcome. |

**Exceptions.** None raised directly; delegates state transitions to `job_manager`.

**File I/O.** None.

**Dependencies.** `job_manager`, `r_executor/` (for `ExecutionResult` type).

---

### 4.5 `reset_service`

**Responsibility.** Cleanly cancel and permanently delete a single job: signal cooperative cancellation, wait for the pipeline task to stop, then remove all traces (in-memory and on disk).

**Public API**

```python
@dataclass
class ResetOutcome:
    found: bool
    was_running: bool
    already_in_progress: bool = False
```

| Function | Signature | Returns |
|---|---|---|
| `reset_job` | `async (job_id: str) -> ResetOutcome` | `ResetOutcome` describing what happened. |

**Exceptions.** `OSError` if the job directory cannot be fully removed (logged; the job is still de-registered from memory).

**File I/O.** Reads: checks whether the job directory exists. Writes: deletes the entire job directory tree.

**Dependencies.** `job_manager`, `file_handler`.

---

### 4.6 `job_cleanup_service`

**Responsibility.** TTL-based background sweep that deletes expired job directories by `mtime`. Runs continuously on the application lifespan. This is also the GDPR data-retention mechanism.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `cleanup_expired_jobs` | `(jobs_dir?, retention_hours?, now?) -> int` | Number of directories deleted. |
| `run_job_cleanup_loop` | `async (jobs_dir?, retention_hours?, interval_seconds?) -> None` | Runs indefinitely; call from the application lifespan. |

Configurable defaults come from `core/config`: `JOB_BASE_DIR`, `JOB_RETENTION_HOURS`, `JOB_CLEANUP_INTERVAL_SECONDS`.

**Exceptions.** `OSError` per directory is caught, logged, and skipped (best-effort deletion; the loop continues).

**File I/O.** Reads: lists and stats files under `JOB_BASE_DIR`. Writes: deletes expired job directories.

**Dependencies.** `core/config`.

---

## 5. Domain / IO Helpers

### 5.1 `file_handler`

**Responsibility.** Validation and on-disk persistence of uploaded IDAT files and sample sheets. The single module responsible for creating job directories and writing initial job artifacts.

**Public API**

| Function | Signature | Returns / side effects |
|---|---|---|
| `read_chunk` | `(file: UploadFile, size: int = 2048) -> bytes` | Reads bytes without consuming the file pointer. |
| `get_file_size` | `(file: UploadFile) -> int` | File size in bytes. |
| `get_total_file_size` | `(files: list[UploadFile]) -> int` | Combined size. |
| `looks_like_idat` | `(file: UploadFile) -> tuple[bool, str]` | Magic-byte plausibility check; returns `(ok, reason)`. |
| `validate_idat_files` | `(files: list[UploadFile]) -> tuple[bool, dict]` | Validates format, content, pairing, and aggregate size. |
| `validate_sample_sheet` | `(file: UploadFile) -> tuple[bool, dict]` | Validates extension, magic bytes, and size. |
| `save_idat_files` | `(files, job_dir) -> list[str]` | Writes IDAT files to `job_dir`; raises `ValueError` on duplicate filename. |
| `save_sample_sheet` | `(file, job_dir) -> str` | Persists the sheet as the fixed name `SampleSheet.csv`. |
| `save_filter_settings` | `(filter_settings: dict, job_dir) -> str` | Writes `filter_settings.json` atomically. |
| `ensure_upload_dir` | `(job_id: str) -> Path` | Creates the job's directory under `JOBS_DIR`. |
| `clean_job_files` | `(job_id: str)` | Best-effort delete; never raises. |
| `job_dir_exists` | `(job_id: str) -> bool` | Disk check. |
| `delete_job_files` | `(job_id: str)` | Deletes the job directory tree; raises `OSError` if it still exists after deletion. |

**Exceptions.** `ValueError` (duplicate filename in `save_idat_files`). `OSError` (`delete_job_files` if removal fails).

**File I/O.** Reads: file content for validation (magic bytes). Writes: IDAT files, `SampleSheet.csv`, `filter_settings.json`. Deletes: job directories.

**Dependencies.** `core/config` (for `JOBS_DIR`), `core/upload_limits`.

---

### 5.2 `archive_utils`

**Responsibility.** Safe extraction of untrusted ZIP archives. Guards against Zip-Slip path traversal, symlinks, zip-bomb expansion, and disallowed member types.

**Public API**

```python
class ArchiveError(Exception):
    code: str      # maps to an AppException error type
    message: str
```

```python
@dataclass
class ExtractedFile:
    path: Path        # absolute path of the extracted file
    rel_path: str     # path relative to dest_dir
```

```python
@dataclass
class ExtractionResult:
    files: list[ExtractedFile]
    skipped_unsupported: list[str]
```

| Function | Signature | Returns |
|---|---|---|
| `safe_extract_zip` | `(zip_path: Path, dest_dir: Path) -> ExtractionResult` | Extracts allowed members; raises `ArchiveError` on any security violation or size breach. |

**Exceptions.** `ArchiveError` (corrupt archive, Zip-Slip attempt, size/count limit breached). Caught by callers and re-raised as `AppException`.

**File I/O.** Reads: ZIP file. Writes: extracted files with mode `0o644`. Writes partial output on error (callers clean up).

**Dependencies.** None (standard library only).

---

### 5.3 `staging_manager`

**Responsibility.** Lifecycle of temporary upload staging sessions. Each session is a UUID-keyed directory under `STAGING_BASE_DIR` with a configurable TTL; it is created at inspect time and deleted on commit or expiry.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `create_session` | `() -> tuple[str, Path]` | `(session_id, session_dir)`. Creates the directory. |
| `require_session` | `(session_id: str) -> Path` | Returns the session directory or raises `AppException(SESSION_NOT_FOUND / SESSION_EXPIRED)`. |
| `expires_at` | `(session_dir: Path) -> str` | ISO-8601 UTC expiry timestamp. |
| `delete_session` | `(session_id: str) -> None` | Removes the session directory (idempotent). |

**Exceptions.** `AppException(SESSION_NOT_FOUND)` (HTTP 404). `AppException(SESSION_EXPIRED)` (HTTP 410).

**File I/O.** Writes: creates staging directories. Deletes: removes staging directories.

**Dependencies.** `core/config` (for `STAGING_BASE_DIR`, `STAGING_RETENTION_HOURS`).

---

### 5.4 `samplesheet_normalizer`

**Responsibility.** Convert any uploaded sample sheet — regardless of container, delimiter, header layout, or column naming — into one canonical Illumina `SampleSheet.csv`. The canonical format is specified in [samplesheet-spec.md](../contracts/samplesheet-spec.md). Nothing else should parse a raw user upload.

**Public constants**

| Constant | Value | Meaning |
|---|---|---|
| `DATA_MARKER` | `"[Data]"` | Section delimiter written to every canonical CSV. |
| `CANONICAL_ROLES` | `("Sentrix_ID", "Sentrix_Position", "Sample_Group", "Sample_Name")` | The four required columns. |
| `BASENAME_COLUMN` | `"Basename"` | Always-present output column (synthesized when absent from input). |

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `normalize_sample_sheet` | `(content: bytes, filename: str, column_mapping: dict \| None = None) -> str` | Full canonical CSV text, ready to write. |
| `build_canonical_csv` | `(raw_headers, rows, column_mapping?) -> str` | Renders parsed headers and rows into canonical CSV. |
| `read_sample_sheet_table` | `(content: bytes, filename: str) -> tuple[list[str], list[list[str]]]` | Parses the data section into `(raw_headers, rows)` without renaming. |
| `suggest_column_mapping` | `(raw_headers: list[str]) -> dict[str, str]` | Best-effort role → raw-column suggestion for the UI pre-fill (confidence-based alias matching). |
| `find_basename_column` | `(headers: list[str]) -> str \| None` | Returns the raw header that denotes the IDAT `Basename`, case/spacing-insensitively. |

**Exceptions.** `ValueError` on structural problems (empty sheet, unreadable Excel, duplicate column names).

**File I/O.** None. Operates entirely in memory on `bytes` / `str`.

**Dependencies.** `openpyxl` (`.xlsx` / `.xls` parsing). No intra-service imports.

---

### 5.5 `samplesheet_parser`

**Responsibility.** Locate and read the canonical `SampleSheet.csv` within a job directory. Single access point for the `[Data]` section; tolerant of the fixed filename and any legacy variants.

**Public constant**

```python
CANONICAL_SAMPLE_SHEET = "SampleSheet.csv"
```

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `find_sample_sheet_name` | `(job_dir: str \| Path) -> str` | Filename of the sample sheet. Raises `AppException(SAMPLE_SHEET_NOT_FOUND)` if absent. |
| `read_data_section` | `(job_dir: Path) -> tuple[list[str], list[list[str]]]` | `(headers, data_rows)` from the `[Data]` section. Raises `AppException(INVALID_CSV_CONTENT)` on parse failure. |
| `columns_by_index` | `(headers, data_rows) -> dict[int, list[str]]` | Column-oriented view: `{col_index: [non-empty values]}`. |

**Exceptions.** `AppException(SAMPLE_SHEET_NOT_FOUND)` (HTTP 404). `AppException(INVALID_CSV_CONTENT)` (HTTP 422).

**File I/O.** Reads: `SampleSheet.csv` (or any `*SampleSheet*` variant) from the job directory.

**Dependencies.** `core/error_types`.

---

### 5.6 `intake_guards`

**Responsibility.** Enforce deployment-wide resource budgets at upload time: maximum sample count per job, maximum total jobs-directory size, and minimum free disk space. Shared by the two-phase and legacy upload paths.

**Public API**

| Function | Signature | Returns / Raises |
|---|---|---|
| `enforce_free_disk_space` | `(instance: str \| None = None) -> None` | Raises `AppException(STORAGE_LIMIT_EXCEEDED)` when free space on the jobs volume is below `MIN_FREE_DISK_MB`. No-op when the limit is 0 (disabled). |
| `enforce_sample_limit` | `(n_samples: int, instance: str) -> None` | Raises `AppException(TOO_MANY_SAMPLES)` when the cohort exceeds `MAX_SAMPLES_PER_JOB`. |
| `enforce_storage_limit` | `(instance: str) -> None` | Raises `AppException(STORAGE_LIMIT_EXCEEDED)` when `JOB_BASE_DIR` total size meets or exceeds `MAX_JOBS_DISK_GB`. |
| `jobs_dir_size_bytes` | `() -> int` | Traverses `JOB_BASE_DIR` and returns total byte count (0 if absent). |
| `storage_error` | `(exc: OSError, instance: str \| None = None) -> AppException` | Converts a disk-write `OSError` to a structured `AppException` (ENOSPC → `STORAGE_LIMIT_EXCEEDED`; other → `SAVE_FAILED`). |

**Exceptions.** `AppException(STORAGE_LIMIT_EXCEEDED)` (HTTP 507). `AppException(TOO_MANY_SAMPLES)` (HTTP 400). `AppException(SAVE_FAILED)` (HTTP 500).

**File I/O.** Reads: disk usage statistics, directory tree traversal of `JOB_BASE_DIR`.

**Dependencies.** `core/config`, `core/error_types`.

---

### 5.7 `table_filter`

**Responsibility.** Shared filter engine for the DMP/DMR result tables and the heatmap CpG selection. Applies the filter map defined in [filter-mapping.md](../contracts/filter-mapping.md) to a pandas DataFrame.

**Public API**

| Symbol | Kind | Description |
|---|---|---|
| `FILTER_MAP` | `dict` | `{table: {key: (column, operator)}}` for `"dmp"` and `"dmr"`. The authoritative mapping; see [filter-mapping.md §4](../contracts/filter-mapping.md#4-reference). |
| `normalize_filters` | `(query_params: dict) -> dict` | Extracts only `filter_*` keys from a query-param dict and strips the prefix. |
| `to_float` | `(value: Any) -> float` | Parses a value as `float`; raises `HTTPException(400)` on failure. |
| `apply_filters` | `(df: pd.DataFrame, table: str, filters: dict) -> pd.DataFrame` | Applies the table's filter map; raises `HTTPException(400)` on an unknown filter key or non-numeric value. |

**Exceptions.** `HTTPException(400)` (unknown filter key, non-numeric filter value).

**File I/O.** None.

**Dependencies.** `pandas`. No intra-service imports.

---

### 5.8 `table_handler`

**Responsibility.** Load, filter, sort, paginate, and export the DMP or DMR result CSVs into a form ready for the Frontend. The single module that translates a CSV on disk into a structured API response.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `load_dataframe` | `(job_id: str, table: str) -> pd.DataFrame` | Raw DataFrame from the result CSV. Raises `HTTPException` on missing file, invalid table name, or analysis not finished. |
| `build_dataframe` | `(job_id, table, sort_by?, sort_order?, filters?) -> pd.DataFrame` | Filtered and sorted DataFrame. Raises `HTTPException(400)` on invalid column or sort order. |
| `get_table_data` | `(job_id, table, page, sort_by?, sort_order?, filters) -> dict` | Paginated page with column metadata, row count, and total pages. |
| `export_table_csv` | `(job_id, table, sort_by?, sort_order?, filters) -> str` | Filtered and sorted full table as CSV text. |

**Exceptions.** `HTTPException(404)` (job not found). `HTTPException(400)` (invalid table / column / sort / page). `HTTPException(409)` (analysis not yet finished).

**File I/O.** Reads: `dmp_results.csv` or `dmr_results.csv` from the job directory.

**Dependencies.** `table_filter`, `job_paths`, `pandas`.

---

## 6. Pipeline Orchestration Services

Orchestration services are `async` coroutines that sequence one or more R commands, manage state transitions, and delegate file I/O to domain helpers. They accept a `cancel_event: asyncio.Event` and must check it (or pass it to `r_executor`) so that `reset_service` can terminate them cooperatively.

### 6.1 `upload_inspect_service`

**Responsibility.** Inspect phase of the two-phase upload: stage the user's files safely, scan them recursively, classify every candidate IDAT pair and sample sheet, and return a manifest for the Frontend to display. No pipeline runs here; nothing enters `jobs/`.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `inspect_upload` | `async (files: list[UploadFile]) -> InspectManifest` | Creates a staging session, extracts any ZIP, classifies all files, and returns the manifest. |
| `build_sheet_preview` | `(session_dir: Path, sheet_id: str, max_rows: int)` | Tabular preview of a candidate sample sheet for the column-mapping UI. |
| `load_internal` | `(session_dir: Path) -> dict` | Reads the session's internal manifest JSON (used by `upload_commit_service`). |

**Exceptions.** `AppException` variants: `ARCHIVE_TOO_LARGE`, `NO_SUPPORTED_FILES`, `INVALID_UPLOAD`, `SAVE_FAILED`, and others. `ArchiveError` during ZIP extraction (re-raised as `AppException`). `OSError` on disk failure (converted via `storage_error`).

**File I/O.** Reads: incoming file bytes, ZIP archives. Writes: extracted/saved files, `_manifest.json` in the staging directory. Deletes: the entire staging session on fatal error.

**Dependencies.** `staging_manager`, `archive_utils`, `samplesheet_normalizer`, `intake_guards`.

---

### 6.2 `upload_commit_service`

**Responsibility.** Commit phase of the two-phase upload: validate the Frontend's file selection and column-role mapping against the staged session, move the chosen files into a fresh job directory, write the canonical sample sheet and filter settings, and register the new job.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `persist_committed_job` | `(req: CommitRequest, instance: str) -> tuple[str, Path]` | `(job_id, job_dir)` on success. |

**Exceptions.** `AppException` variants: `INVALID_SELECTION` (unknown file ids), `NO_SAMPLE_SHEET`, `UNPAIRED_IDATS`, `INVALID_COLUMN_MAPPING`, `TOO_MANY_SAMPLES`, `STORAGE_LIMIT_EXCEEDED`, `SAVE_FAILED`.

**File I/O.** Reads: staged files, `_manifest.json`. Writes: IDAT files, `SampleSheet.csv`, `filter_settings.json` in the new job directory. Deletes: the staging session on success.

**Dependencies.** `staging_manager`, `upload_inspect_service` (manifest), `samplesheet_normalizer`, `file_handler`, `intake_guards`, `job_manager`.

---

### 6.3 `upload_service`

**Responsibility.** Legacy single-shot upload: persist all files with a rollback on failure, enforce intake guards, then run the filtering → normalization-preview pipeline in one request cycle. New clients use the two-phase flow (`inspect` + `commit`); this service remains for backwards compatibility.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `persist_upload_files` | `(job_id, job_dir, idat_files, sample_sheet, filter_settings, instance) -> None` | Persists all files with rollback. |
| `run_upload_pipeline` | `async (job_id, job_dir, sample_sheet_filename, filter_settings, cancel_event) -> None` | Runs filtering then normalization preview. |

**Exceptions.** `AppException(INVALID_UPLOAD)`, `AppException(SAVE_FAILED)`, intake-guard exceptions.

**File I/O.** Writes: IDAT files, `SampleSheet.csv`, `filter_settings.json`. Reads/triggers: R script artifacts written by `init_filter.R` and `normalization_preview.R`.

**Dependencies.** `job_manager`, `file_handler`, `intake_guards`, `r_executor/`, `pipeline_outcome`, `normalization_preview_service`.

---

### 6.4 `normalize_service`

**Responsibility.** Normalization pipeline: run `normalize.R` for the chosen method (or copy the filtered data for the `raw` baseline), then produce the round-0 SVD plot via `batch_svd.R`.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `run_normalization_pipeline` | `async (job_id, job_dir_id, method, cancel_event) -> None` | Runs `normalize.R` and `batch_svd.R` sequentially. |

**Exceptions.** None raised to the caller; step failures are recorded as `FAILED` transitions in `job_manager`.

**File I/O.** Reads: `filtered_data.rds`. Writes (via R): `normalized_data.rds`, `svd_plot_0.png`, `svd_plot_0.pdf`.

**Dependencies.** `job_manager`, `job_paths`, `samplesheet_parser`, `pipeline_outcome`, `r_executor/`.

---

### 6.5 `normalization_preview_service`

**Responsibility.** Normalization-preview pipeline: run `normalization_preview.R`, which generates density plots and PCA data for all supported methods, then scan the job directory for the produced artifacts and write `preview_plots.json`.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `run_normalization_preview` | `async (job_id, job_dir, sample_sheet, cancel_event) -> None` | Runs the preview R script and writes `preview_plots.json`. |

**Exceptions.** None raised to the caller.

**File I/O.** Reads: job directory (scans for `density_*.png` and `pca_*.json`). Writes (via R): `density_<method>.{png,pdf}`, `pca_<method>.json`. Writes (Python): `preview_plots.json`.

**Dependencies.** `job_manager`, `pipeline_outcome`, `r_executor/`.

---

### 6.6 `batch_service`

**Responsibility.** Batch-correction and downstream differential-analysis orchestration, plus sample-sheet helpers that support the batch UI.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `get_eligible_columns` | `(job_dir: Path) -> list[dict]` | Columns usable as batch variable or covariate; each entry is `{"name": str, "levels": list}`. |
| `validate_group_selection` | `(job_dir, group_column, case_group, control_group) -> None` | Validates the DMP/DMR contrast selection; raises `AppException` on invalid input. |
| `get_available_columns_from_samplesheet` | `(job_dir: Path) -> list` | All column names eligible for grouping. |
| `get_samplesheet_preview` | `(job_dir, max_rows?) -> dict` | Tabular sample-sheet preview for the role-assignment UI. |
| `load_history` | `(job_dir, job_id) -> dict` | Loads `batch_history.json`; tolerates missing or corrupt file (returns empty dict). |
| `save_history` | `(job_dir, data) -> None` | Persists `batch_history.json` atomically via `core/atomic_io`. |
| `next_correction_round` | `(history: dict) -> int` | Returns the next round number (0-based). |
| `run_batch_pipeline_task` | `async (job_id, settings_dict, next_round, job_dir, cancel_event) -> None` | Runs `batch_correct.R` and the round-N SVD plot. |
| `run_downstream_analysis_task` | `async (job_id, job_dir_raw, cancel_event, *, array_type, extract_from_normalized, group_column, case_group, control_group) -> None` | Extracts the beta matrix, then runs `dmr.R` and `dmp.R`. |

**Exceptions.** `AppException(INVALID_BATCH_VARIABLE)`, `AppException(INVALID_SELECTION)` from `validate_group_selection`.

**File I/O.**
- Reads: `SampleSheet.csv`, `batch_history.json`, `normalized_data.rds` or `corrected_data.rds`.
- Writes (via R): `corrected_data.rds`, `svd_plot_<round>.{png,pdf}`, `dmp_results.{rds,csv}`, `dmr_results.{rds,csv}`.
- Writes (Python, inline R): `beta.rds` via an inline `getBeta()` call executed in the R worker, `batch_history.json`.

**Dependencies.** `job_manager`, `job_paths`, `samplesheet_parser`, `pipeline_outcome`, `r_executor/`, `core/atomic_io`.

---

### 6.7 `heatmap_service`

**Responsibility.** Heatmap pipeline and grouping-option helpers: apply the shared DMP filter to select CpGs, write the input CSV for `heatmap.R`, run the script, and provide the Frontend with available grouping and annotation columns.

**Public API**

| Function | Signature | Returns |
|---|---|---|
| `prepare_heatmap_input` | `(job_id, job_dir, filters: dict) -> int` | Applies DMP filters, enforces the 500-CpG cap, writes `heatmap_input.csv`; returns the selected CpG count. |
| `run_heatmap_pipeline_task` | `async (job_id, job_dir, dmp_rds, sheet_name, grouping, cancel_event) -> None` | Runs `heatmap.R` and handles result transitions. |
| `get_grouping_options_from_samplesheet` | `(job_dir: Path) -> list` | Returns column names suitable for strict sample grouping. |
| `find_annotation_columns` | `(job_dir: Path) -> list[dict]` | Returns all sample-sheet columns as annotation options with a type hint (`categorical` / `numeric`). |

**Exceptions.** `AppException(FILE_NOT_FOUND)` (DMP results absent). `AppException(HEATMAP_NO_CPGS)` (filter selects zero CpGs). `AppException(HEATMAP_TOO_MANY_CPGS)` (selection exceeds 500). `AppException(INVALID_CSV_CONTENT)` (malformed result CSV).

**File I/O.**
- Reads: `dmp_results.csv`, `SampleSheet.csv`, `dmp_results.rds`.
- Writes (Python): `heatmap_input.csv`.
- Writes (via R): `heatmap.png`, `heatmap.pdf`.

**Dependencies.** `table_filter`, `r_executor/`, `job_paths`, `samplesheet_normalizer` (for `BASENAME_COLUMN`), `samplesheet_parser`, `job_manager`.

---

## 7. Error Model

All structured errors in the service layer inherit from `AppException` (defined in `core/error_types`). `AppException` carries an `ErrorType` (a URI, HTTP status code, and RFC 9457 title) plus a human-readable `detail` string and an optional `instance` URI. A single FastAPI exception handler in `main.py` renders every `AppException` as an `application/problem+json` response with the correct HTTP status.

```
AppException (core/error_types.py)
├── InvalidTransitionError   — HTTP 409  disallowed job state transition
└── JobSessionExpiredError   — HTTP 410  in-memory session lost (e.g., server restart)
```

`table_handler` and `table_filter` also raise FastAPI `HTTPException` directly (400/404/409) for query-parameter errors that are purely API-layer concerns and not domain failures.

`ArchiveError` (from `archive_utils`) is an internal exception. Callers in `upload_inspect_service` catch it and convert it to the appropriate `AppException`.

`ValueError` from `samplesheet_normalizer` signals structural sheet problems; callers convert it to `AppException(INVALID_UPLOAD)`.

The full error-type catalogue (URIs, status codes, and example bodies) is in [api-contract.md](../api/api-contract.md).

---

## 8. Extension Points

### Add a new pipeline step

1. Create an R script and document it in [scripts-reference.md](../r-backend/scripts-reference.md) and [job-directory-layout.md](../contracts/job-directory-layout.md).
2. Add an `RCommand` subclass in `r_executor/commands/commands.py`. Never modify `executor.py`.
3. Write an `async run_<step>_pipeline(job_id, …, cancel_event)` coroutine in a new or existing orchestration service. Use `handle_step_result` from `pipeline_outcome` to apply the standard cancel/timeout/failure policy.
4. Add the new `(phase, status)` values to `job_manager` and the transition graph (→ [job-lifecycle.md](../architecture/job-lifecycle.md)).
5. Schedule the coroutine from the route via `pipeline_task.start_job_pipeline` — never create a `cancel_event` in the service.

### Add a new filter

Add the `(column, operator)` entry to `FILTER_MAP` in `table_filter.py` and update [filter-mapping.md §4](../contracts/filter-mapping.md#4-reference). If the operator is new, also add a branch in `apply_filters`. See the extension point in [filter-mapping.md §6](../contracts/filter-mapping.md#6-extension-points).

### Add a new sample-sheet column or role

1. Update `samplesheet_normalizer.py` (`CANONICAL_ROLES` or the alias table).
2. If the column is consumed by an R script, update `utils/samplesheet.R` in the R backend.
3. Update [samplesheet-spec.md](../contracts/samplesheet-spec.md) and any R-script documentation.

### Add a new intake guard

Add a function to `intake_guards.py` following the pattern of `enforce_sample_limit`. Call it from every upload path (`upload_inspect_service`, `upload_commit_service`, `upload_service`). Add the corresponding `ErrorType` constant to `core/error_types.py` if a new error category is needed.

### Add a new configuration parameter

Add the variable to `core/config.py` with a validated default (fail-fast at import). Mirror it in `.env.example` and `docker-compose.yml`. Document it in [configuration.md](../backend/configuration.md).
