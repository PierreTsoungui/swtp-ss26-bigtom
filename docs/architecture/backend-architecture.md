# Architecture Specification: MethylAnalyzer Backend

**Scope:** `backend/app/` — the FastAPI application that orchestrates the
methylation-analysis pipeline

---

## 1. Overview

The backend is an asynchronous HTTP API that drives a multi-step DNA-methylation
analysis pipeline (filtering → normalization → batch correction → differential
analysis → heatmap). The numerically heavy work is **not** done in Python: it is
delegated to R scripts that run inside a separate Docker container. The Python
backend's job is **orchestration**: accept uploads, sequence the pipeline steps,
track each job's state, stream progress to the frontend, and serve the resulting
artifacts.

**Architectural style:** a classic **layered architecture** (API → Services →
Domain/IO, with Core cross-cutting) combined with **asynchronous, fire-and-forget
pipeline execution** and **process-isolated compute** (R via `docker exec`).

### 1.1 System context

```
┌────────────┐   HTTP/JSON (REST, /api/v1)   ┌──────────────────────┐
│  Frontend  │  ─────────────────────────►   │   Backend (FastAPI)  │
│  (browser) │   ◄─────────────────────────  │   Python, async      │
└────────────┘   202 + status polling        └──────────┬───────────┘
                                                         │ docker exec (subprocess)
                                                         │ line-based JSON over stdout
                                              ┌──────────▼───────────┐
                                              │   R worker container │
                                              │   (minfi, limma, …)  │
                                              └──────────┬───────────┘
                                                         │ reads/writes
                                              ┌──────────▼───────────┐
                                              │  Shared job volume   │
                                              │  jobs/<job_id>/…      │
                                              └──────────────────────┘
```

The Python backend and the R worker communicate in two ways only: (1) the backend
launches R via `docker exec` and reads its stdout/stderr; (2) both sides exchange
data through files in the shared `jobs/<job_id>/` directory.

---

## 2. Layer model

| Layer | Directory | Responsibility | Must NOT |
|---|---|---|---|
| **API / Routes** | `app/api/routes/` | HTTP adapter: validate input, map errors to HTTP, set the initial state transition, schedule the pipeline, serve artifacts. | Contain R calls, heavy file I/O, or multi-step orchestration. |
| **Services** | `app/services/` | All business logic: pipeline orchestration, domain helpers, and infrastructure (state, execution, cleanup). | Depend on FastAPI request/response objects. |
| **Models** | `app/models/` | Pydantic schemas for request/response bodies and the `JobStatus` domain model. | Contain behavior beyond validation. |
| **Core** | `app/core/` | Cross-cutting concerns: configuration, logging, error model, exceptions. | Depend on routes or services. |
| **R backend** | `r_backend/` (separate process) | Numerical computation. | — |

**Dependency rule:** dependencies point downward only. Routes depend on services
and models; services depend on core and other services; core depends on nothing
in the app. The R backend is reached exclusively through the `r_executor`
subpackage.

---

## 3. Module reference

### 3.1 `app/main.py` — composition root
Creates the `FastAPI` app, registers the RFC-9457 exception handler, configures
CORS, mounts all routers under `/api/v1`, and runs a **lifespan** hook that starts
and stops the background job-cleanup loop. Calls `setup_logging()` at import time.

### 3.2 `app/api/routes/` — the API layer

| Router | Endpoint(s) | Purpose |
|---|---|---|
| `upload.py` | `POST /upload` | Validate IDAT files + sample sheet, create the job, schedule the **filtering → normalization-preview** pipeline. |
| `status.py` | `GET /status/{job_id}` | Return the current `JobStatus` (the frontend polls this). |
| `stats.py` | `GET /filter/{job_id}/stats` | Serve `filter_stats.json`. |
| `normalization_preview.py` | `GET /preview/normalization/{job_id}`, `…/{plot_name}` | Serve `preview_plots.json` and the preview PNGs. |
| `normalize.py` | `POST /normalize/{job_id}` | Start normalization with a chosen method, then SVD round 0. |
| `batch.py` | `POST /batch/{job_id}`, `…/skip`, `GET …/history`, `…/svd-plot/{n}`, `…/batch-options` | Run/iterate batch correction; enter downstream analysis. |
| `heatmap.py` | `POST /heatmap/{job_id}`, `GET …`, `…/options` | Generate and serve the heatmap. |
| `reset.py` | `POST /reset/{job_id}` | Cancel a running job and delete it. |
| `table.py` | `GET /table/{job_id}/{table}`, `…/export` | Paginated/filterable DMR/DMP result tables (CSV export). |

### 3.3 `app/services/` — the service layer

Three roles share this directory; the distinction is conceptual, not enforced by
sub-folders:

**(a) Pipeline orchestration** — `async` coroutines that sequence R steps and
state transitions. Each receives a `cancel_event` and does **not** manage the task
lifecycle itself (that is `pipeline_task`'s job).
- `normalize_service.run_normalization_pipeline` — normalization + SVD round 0.
- `normalization_preview_service.run_normalization_preview` — preview plots; detects PNGs and writes `preview_plots.json`.
- `batch_service.run_batch_pipeline_task` — batch correction + SVD round N.
- `batch_service.run_downstream_analysis_task` — DMR + DMP analysis.
- `heatmap_service.run_heatmap_pipeline_task` — heatmap generation.
- `upload_service.run_upload_pipeline` — filtering + preview. `upload_service.persist_upload_files` handles upload persistence with rollback.

**(b) Domain / IO helpers** — pure, synchronous utilities.
- `file_handler.py` — IDAT/sample-sheet validation and persistence, job-dir setup.
- `samplesheet_utils.py` — derive grouping columns from a sample sheet.
- `table_handler.py` / `table_filter.py` — load result RDS/CSV into pandas, filter, paginate, export.

**(c) Infrastructure** — the runtime backbone.
- `job_manager.py` — the **job state machine** + the in-memory registries (`jobs`, `cancel_events`, `job_tasks`, `resetting_jobs`). Single source of truth for job state.
- `pipeline_task.py` — owns the background-task lifecycle: creates the `cancel_event`, registers/clears the task, guarantees cleanup. Two entry points: `run_job_pipeline` (for FastAPI `BackgroundTasks`) and `start_job_pipeline` (fire-and-forget task).
- `reset_service.py` — orchestrates cancellation + deletion of a job (idempotent, concurrency-safe).
- `job_cleanup_service.py` — periodic deletion of expired `jobs/<id>/` directories.
- `r_executor/` — subprocess execution of R commands (see §3.5).

### 3.4 `app/models/` — schemas
Pydantic models, **one module per domain**: `job.py` (`JobStatus`,
`StatusResponse`), `upload.py` (`UploadResponse`), `normalize.py`
(`NormalizeRequest/Response`), `filter.py` (`FilterSettings` + sub-filters),
`batch.py`, `heatmap.py`, `table.py`. `JobStatus` is the in-memory domain object
the state machine mutates; the `*Response` models are the HTTP contract.

### 3.5 `app/services/r_executor/` — the execution subpackage
The only place that knows how to run R. See [r-executor.md](./r-executor.md).
- `executor.py::run_r_script(command, cancel_event, on_progress)` — starts the subprocess, streams output, enforces the per-command timeout, drains stdout/stderr, resolves to an `ExecutionResult`.
- `commands/` — one `RCommand` dataclass per R script (`FilteringCommand`, `NormalizationCommand`, `BatchCorrectionCommand`, …). Each builds its own `docker exec` argv (Command pattern).
- `result.py` — `ExecutionResult` + `ExecutionStatus` (`completed` / `failed` / `cancelled` / `timeout`).
- `protocol.py` — `extract_json_objects()`, the robust scanner for the R JSON stream.

### 3.6 `app/core/` — cross-cutting
- `config.py` — env-driven config: `JOB_BASE_DIR`, `JOB_RETENTION_HOURS`, `JOB_CLEANUP_INTERVAL_SECONDS` (validated).
- `error_types.py` — `ErrorTypes` catalogue, `problem_detail()` (RFC 9457), `AppException`, and the `app_exception_handler`.
- `exceptions.py` — `InvalidTransitionError` (→ HTTP 409).
- `logging_config.py` — `setup_logging()`; see [logging-backend.md](./logging-backend.md).

---

## 4. Cross-cutting mechanisms

### 4.1 Job lifecycle & state machine
A job is a `(phase, status)` pair plus progress metadata, held in
`job_manager.jobs[job_id]`. **Every** state change goes through
`transition_job()`, which validates the move against `_ALLOWED_TRANSITIONS`; an
illegal move raises `InvalidTransitionError` → HTTP 409. This makes the set of
reachable states explicit and prevents inconsistent transitions under
concurrency. See §6 for the full table.

### 4.2 Asynchronous pipeline execution
Pipeline steps take minutes, so routes never block on them. The pattern is
uniform:

1. The route validates input and performs the **initial** `transition_job` to a
   `RUNNING` state (synchronously, so a follow-up status poll cannot race ahead).
2. The route schedules the pipeline through `pipeline_task`, passing a factory
   `lambda cancel_event: <service_coroutine>(…, cancel_event)`.
3. The route returns `202 Accepted` immediately.
4. `pipeline_task` creates the `cancel_event`, registers the task, runs the
   coroutine, and clears both registrations in a `finally` block.

### 4.3 Cancellation & reset
Cancellation is **cooperative**. `POST /reset/{job_id}` → `reset_service` sets the
job's `cancel_event`; the running pipeline observes it (the executor reacts within
O(1)), the service returns cleanly, and `reset_service` deletes the job. Only the
executor ever kills the R subprocess. While a reset is in progress the job is
marked in `resetting_jobs`, which turns any trailing `transition_job` into a
silent no-op. See [r-executor.md](./r-executor.md) §6.

### 4.4 R subprocess protocol
R scripts emit one JSON object per stdout line (`utils/progress.R`):
`{"type":"progress",…}`, `{"type":"error",…}`, `{"type":"done",…}`,
`{"type":"plot",…}`. The executor parses these, forwards `progress`/`error`/`done`
to the caller's `on_progress` callback (which usually calls
`job_manager.set_progress`), and captures the last `error` message into
`ExecutionResult.extra["r_error"]`. A non-zero exit code maps to
`ExecutionStatus.FAILED`. See [pipeline-progress.md](./pipeline-progress.md).

### 4.5 Error model
All API errors are RFC 9457 Problem Details produced by `problem_detail()` /
`AppException`. Domain code raises `AppException` (or `InvalidTransitionError`);
`app_exception_handler` renders them to the correct status code and JSON body.

### 4.6 Job cleanup
A lifespan-managed background loop (`run_job_cleanup_loop`) periodically deletes
`jobs/<id>/` directories whose mtime is older than `JOB_RETENTION_HOURS`, off the
event loop via `asyncio.to_thread`.

---

## 5. Reference flow: upload → preview

```
POST /upload
  └─ upload.py: validate IDAT + sample sheet  → 400 on failure
                upload_service.persist_upload_files()  → 400/500 on failure
                create_job(); transition UPLOADED→COMPLETED
                background_tasks.add_task(run_job_pipeline, run_upload_pipeline)
                return 201 {job_id, status: waiting}

[background] pipeline_task.run_job_pipeline
  └─ register cancel_event + task
     upload_service.run_upload_pipeline(cancel_event):
        transition FILTERING/RUNNING
        run_r_script(FilteringCommand)  ──► R (init_filter.R) ──► filter_stats.json, filtered_data.rds
        transition FILTERING/COMPLETED → NORMALIZATION_PREVIEW/RUNNING
        run_normalization_preview(cancel_event):
            run_r_script(NormalizationPreviewCommand) ──► R ──► *.png
            scan PNGs → preview_plots.json
            transition NORMALIZATION_PREVIEW/COMPLETED → NORMALIZATION/WAITING
     finally: unregister cancel_event + task

Frontend polls GET /status/{job_id} throughout.
```

The same shape applies to `/normalize`, `/batch`, `/batch/skip`, and `/heatmap`.

---

## 6. State machine reference

**Phases:** `uploaded`, `filtering`, `normalization_preview`, `normalization`,
`svd`, `batch`, `analysis`, `results`, `heatmap`.
**Statuses:** `waiting`, `running`, `completed`, `failed`.

Allowed transitions are defined in `job_manager._ALLOWED_TRANSITIONS`. The happy
path:

```
uploaded/waiting → uploaded/completed → filtering/running → filtering/completed
→ normalization_preview/running → …/completed → normalization/waiting
→ normalization/running → …/completed → svd/running → …/completed
→ batch/waiting ─┬─ batch/running → …/completed → svd/running → … → batch/waiting   (correct, loops)
                 └─ analysis/running → …/completed → results/waiting                 (skip → downstream)
results/waiting → heatmap/running → …/completed → results/waiting
```

Recovery edges exist (e.g. `normalization/failed → normalization/running`,
`batch/failed → batch/running`, `heatmap/failed → results/waiting`) so a user can
retry a failed step without re-running the whole pipeline.

---

## 7. Runtime & deployment

- **Process model:** a single FastAPI process (one event loop). All job state is
  **in-memory**; pipeline tasks are asyncio tasks on that loop.
- **R worker:** a long-lived Docker container (`R_WORKER_CONTAINER` in
  `commands/base.py`). The backend invokes R via `docker exec <container> Rscript …`.
- **Shared storage:** `jobs/<job_id>/` is a volume visible to both the backend
  (host path) and the R worker (`/app/jobs/<job_id>`). Command objects translate
  between host and container paths.
- **Durable vs ephemeral:** files on the volume are durable (until cleanup);
  in-memory job state is ephemeral and lost on restart.

### 7.1 Job directory artifacts (by step)
`SampleSheet.csv`, IDATs, `filter_settings.json` (upload) · `filter_stats.json`,
`filtered_data.rds` (filtering) · `density_*.png`, `pca_*.png`,
`preview_plots.json` (preview) · `normalized_data.rds`, `svd_plot_0.png`
(normalization) · `corrected_data.rds`, `svd_plot_N.png`, `batch_history.json`
(batch) · `beta.rds`, DMR/DMP result RDS (analysis) · `heatmap.png` (heatmap).

---

## 8. Architecture decisions & recommendations

### 8.1 Do we need a layer between routes and services?
**No new physical layer is warranted.** The implicit "pipeline orchestration"
role already exists inside the service layer and is the correct home for
sequencing logic. Introducing a separate application/use-case layer (hexagonal
style) would add indirection without payoff at this project's size. What *is*
needed is **consistency** of the existing layering:

- **Recommendation R1 (consistency) — DONE.** Upload orchestration now lives in
  `upload_service.py` (`run_upload_pipeline` + `persist_upload_files`);
  `routes/upload.py` is a thin adapter. The rule "routes contain no
  orchestration" now holds without exception.

### 8.2 Further recommendations

- **R2 — Consolidate sample-sheet parsing.** Column-detection logic is duplicated
  across `batch_service.get_available_columns_from_samplesheet`,
  `heatmap_service.get_grouping_options_from_samplesheet`, and
  `samplesheet_utils`. Unify into `samplesheet_utils` and have both callers use
  it. This also addresses the Python/R column-mismatch class of bugs (the batch
  variable a route accepts must be one R's `read.metharray.sheet` actually
  exposes).
- **R3 — Externalize the worker container name.** `R_WORKER_CONTAINER` is
  hard-coded in `commands/base.py`; move it to `core/config.py` (env-driven) so
  deployments and tests can override it.
- **R4 — Configurable timeout.** `RCommand.timeout_seconds` has sensible
  per-command defaults; expose a global override via env (`R_SCRIPT_TIMEOUT_SECONDS`).
- **R5 — (Future) `RBackend` seam.** The executor is coupled to `docker exec`. An
  interface with `DockerRBackend` / `MockRBackend` implementations would make the
  pipeline services unit-testable without Docker.
- **R6 — (Future) `JobRepository` seam.** `job_manager` mixes the state machine
  (domain) with module-level dict storage. A thin repository interface would
  decouple them and is the prerequisite for persistence or multi-worker scaling
  (see §8.3).

### 8.3 Known boundaries (by design, not defects)
- **Single-process, in-memory state.** No horizontal scaling; a restart loses all
  in-flight job state (files survive). Acceptable for the current single-instance
  deployment; revisit via R6 + an external store (Redis/DB) if scaling is needed.
- **Docker coupling.** The backend must be able to reach the Docker socket to
  `exec` into the worker.

---

## 9. Conventions (contributor checklist)

- **New endpoint:** add a router in `app/api/routes/`, a Pydantic
  request/response in `app/models/`, raise `AppException`/`problem_detail` for
  errors. Keep it thin.
- **New pipeline step:** add an `RCommand` subclass in `r_executor/commands/`,
  add a service coroutine taking `cancel_event`, add the `(phase, status)`
  transitions to `_ALLOWED_TRANSITIONS`, and schedule it via `pipeline_task`.
  **Never** modify `executor.py` for a new step.
- **State change:** only through `transition_job` / `set_progress`. Never mutate
  `JobStatus` directly.
- **Background work:** only through `pipeline_task`. Never create the
  `cancel_event` or register the task in a service or route.
- **Logging:** printf-style, key=value, per [logging-backend.md](./logging-backend.md).
  No f-strings in log calls, no `print`.
