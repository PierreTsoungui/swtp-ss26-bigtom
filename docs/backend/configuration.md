# Reference: Backend Configuration

**Scope:** `backend/app/core/config.py`, `backend/app/core/logging_config.py`, `.env.example`, `docker-compose.yml` — every runtime-tunable in the application.

> This document is the **single reference for every configurable value** the application reads at startup. It covers the Python backend variables, the Docker Compose resource variables, and the R-worker threading pins. For the *why* behind the two-layer resource strategy (soft queue + hard container wall), see [docker.md](../deployment/docker.md). For the services that consume these values, see [services-reference.md](../backend/services-reference.md).

---

## Table of Contents

- [1. How configuration works](#1-how-configuration-works)
- [2. Setting values](#2-setting-values)
- [3. Backend Python variables](#3-backend-python-variables)
  - [3.1 Storage and lifecycle](#31-storage-and-lifecycle)
  - [3.2 Staging](#32-staging)
  - [3.3 R parallelism](#33-r-parallelism)
  - [3.4 Resource budget (soft admission queue)](#34-resource-budget-soft-admission-queue)
  - [3.5 Intake guards](#35-intake-guards)
  - [3.6 Upload limits](#36-upload-limits)
  - [3.7 CORS](#37-cors)
  - [3.8 Logging](#38-logging)
- [4. Docker Compose resource variables](#4-docker-compose-resource-variables)
- [5. R-worker threading pins](#5-r-worker-threading-pins)
- [6. Validation behaviour](#6-validation-behaviour)
- [7. Sizing examples](#7-sizing-examples)
- [8. Extension points](#8-extension-points)
- [9. Cross-links](#9-cross-links)

---

## 1. How configuration works

Every tunable is read from the environment by `backend/app/core/config.py` at **import time**. A missing variable falls back to a documented default; an invalid value (wrong type or out-of-range) raises `ValueError` immediately, which prevents the application from starting with a broken configuration (fail-fast).

Validated variables are exported as module-level constants. All other application code imports those constants — nothing reads `os.getenv` outside of `config.py` and `logging_config.py`. This means there is exactly one place to check what a variable does and what its limits are.

---

## 2. Setting values

Create a `.env` file by copying `.env.example` at the repository root. Docker Compose reads `.env` automatically. Variables not present in `.env` fall back to the defaults listed in the tables below.

```
cp .env.example .env
# Edit .env for the target machine, then:
docker compose up -d
```

The `.env` file is `.gitignore`d so each deployment keeps its own values. **Never commit `.env` to version control.**

---

## 3. Backend Python variables

These variables are read by `backend/app/core/config.py` (and `logging_config.py` for `LOG_LEVEL`). They are passed to the backend container via the `environment` block in `docker-compose.yml`.

### 3.1 Storage and lifecycle

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `JOB_BASE_DIR` | `./jobs` (dev) / `/app/jobs` (container) | path | — | Root directory for all job directories. Every job's artifacts live under `JOB_BASE_DIR/<job_id>/`. Must be on the same filesystem as `JOB_BASE_DIR/staging/` (see §3.2) so that the inspect→commit move is atomic. |
| `JOB_RETENTION_HOURS` | `24` | hours | `> 0` (float) | Maximum age of a job directory measured by `mtime`. Directories older than this are deleted by the cleanup loop. The clock starts when the directory is last modified, not when the job finishes. |
| `JOB_CLEANUP_INTERVAL_SECONDS` | `86400` (24 h) | seconds | `> 0` (int) | How often the cleanup loop runs. A shorter interval reduces the lag between expiry and deletion; a longer interval reduces I/O overhead. |

> **Note.** `JOB_RETENTION_HOURS` is the primary GDPR data-retention control: uploaded patient data is automatically removed after this window. See [job-lifecycle.md](../architecture/job-lifecycle.md) for the full retention and deletion contract.

---

### 3.2 Staging

Staging is the temporary holding area for uploads that are in the inspect phase but have not yet been committed to a job. The staging directory is always at `JOB_BASE_DIR/staging/` — it is derived automatically and **not configurable independently**.

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `STAGING_RETENTION_HOURS` | `2` | hours | `> 0` (float) | Inactivity window after which an unconfirmed upload session is considered abandoned and deleted. The TTL uses a **rolling (sliding) window**: every request that touches the session (`preview`, `commit`) resets the expiry clock. A user who actively reviews the inspect result will never lose their session mid-workflow; only sessions with no activity for the full retention window are removed. |
| `STAGING_CLEANUP_INTERVAL_SECONDS` | `900` (15 min) | seconds | `> 0` (int) | How often the staging cleanup loop runs. Should be significantly shorter than `STAGING_RETENTION_HOURS` so sessions do not linger long after expiry. |

> **`STAGING_BASE_DIR` is not a configurable variable.** The path is derived as `JOB_BASE_DIR + "/staging"` in code, ensuring that both directories are always on the same filesystem. Setting a `STAGING_BASE_DIR` environment variable has no effect.

---

### 3.3 R parallelism

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `DMR_CORES` | `1` | cores | `> 0` (int) | Number of parallel bootstrap workers passed to `dmr.R` (via ChAMP's `champ.DMR`). Each worker holds an independent copy of the beta matrix, so **peak RAM scales approximately linearly with this value**: 1 core ≈ 3.6 GiB, 3 cores ≈ 11 GiB. Raise only on machines with RAM to spare and update `PIPELINE_DMR_MEMORY_GB` to match the new measured peak. Values above the host's physical core count are harmless (R caps internally at `detectCores()`). |

---

### 3.4 Resource budget (soft admission queue)

The backend maintains a weighted admission queue (the *resource governor*) that gates R steps against estimated memory and core requirements. When a new step's estimated cost would exceed the remaining budget, it waits in the queue until capacity frees up. This produces graceful slow-down under load rather than OOM crashes.

These variables define the budget and per-step cost estimates. They work together with the hard container wall set in `docker-compose.yml` (§4); see [docker.md](../deployment/docker.md) for the two-layer strategy.

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `PIPELINE_MEMORY_BUDGET_GB` | `12.0` | GiB | `> 0` (float) | Total memory budget available to the queue. Steps are admitted only if their cumulative estimated peak fits within this ceiling. Must be `≤ R_WORKER_MEM_LIMIT` (§4) so the soft queue engages before the hard container wall. |
| `PIPELINE_CORE_BUDGET` | `2` | cores | `> 0` (int) | Total CPU core budget for the queue. Mirror `R_WORKER_CPUS` (§4) or set lower to leave headroom for the OS. |
| `PIPELINE_STEP_MEMORY_GB` | `5.0` | GiB | `> 0` (float) | Per-step memory estimate for all pipeline steps not listed below (filtering, normalization preview, normalization, SVD, batch correction, heatmap). |
| `PIPELINE_DMR_MEMORY_GB` | `6.0` | GiB | `> 0` (float) | Per-step memory estimate for the DMR step, which is the heaviest step in the pipeline. Derived from the benchmark suite (`benchmarks/`). Update after changing `DMR_CORES` or the dataset size. |
| `PIPELINE_DMP_MEMORY_GB` | `4.0` | GiB | `> 0` (float) | Per-step memory estimate for the DMP step. |

A step whose estimated cost exceeds the entire budget is admitted immediately alone (clamped), so an over-sized estimate never deadlocks the queue.

> **Relationship to the hard wall.** `PIPELINE_MEMORY_BUDGET_GB` is a *soft* admission gate; `R_WORKER_MEM_LIMIT` in `docker-compose.yml` is the *hard* cgroup ceiling. If estimates are wrong and the container exceeds the hard limit, the cgroup OOM-killer terminates the R process while the host stays alive. Both must be set correctly for safe operation.

---

### 3.5 Intake guards

Intake guards reject an upload before any pipeline work starts, giving the user a clear error rather than a mid-pipeline failure.

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `MAX_SAMPLES_PER_JOB` | `48` | samples | `≥ 0` (int, 0 = unlimited) | Maximum number of samples (IDAT pairs) per job. Uploads exceeding this are rejected at commit with HTTP 400. Memory scales with sample count; tune to the RAM budget (benchmark first). |
| `MAX_JOBS_DISK_GB` | `0` | GiB | `≥ 0` (float, 0 = disabled) | Maximum total size of all job directories combined. A new upload is rejected if `JOB_BASE_DIR` already occupies this much disk space. Size to the machine's available disk. `0` disables the check (not recommended in production). |
| `MIN_FREE_DISK_MB` | `0` | MiB | `≥ 0` (int, 0 = disabled) | Minimum free space required on the storage volume before an upload is accepted. Unlike `MAX_JOBS_DISK_GB`, this checks the filesystem's actual free space, so it also catches disk fill-up from other tenants. `0` disables the check. |

---

### 3.6 Upload limits

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `MAX_TOTAL_UPLOAD_MB` | `900` | MiB | `> 0` (int) | Maximum combined size of all IDAT files in a single upload. Multiplied by `1024 * 1024` internally to produce a byte ceiling. The typical payload for an EPICv2 dataset with ~30 samples is approximately 300–400 MiB. |
| `MAX_SAMPLE_SHEET_MB` | `10` | MiB | `> 0` (int) | Maximum size of the sample-sheet file. |

> **Relationship to the nginx body size limit.** The nginx reverse proxy also enforces a body size limit (`client_max_body_size` in `proxy_params`). Both limits must be consistent; the nginx limit should be `≥ MAX_TOTAL_UPLOAD_MB + MAX_SAMPLE_SHEET_MB + multipart overhead`. See [docker.md](../deployment/docker.md) for the nginx configuration.

---

### 3.7 CORS

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,http://localhost:8080,https://localhost,https://127.0.0.1` | comma-separated URLs | — | Browser origins allowed to call the API. In production, set this to the deployed frontend URL (e.g. `https://app.example.com`). A literal `*` disables the origin allowlist and is not recommended when credentials are involved. |

---

### 3.8 Logging

| Variable | Default | Unit | Validation | Effect |
|---|---|---|---|---|
| `LOG_LEVEL` | `DEBUG` (application default) / `INFO` (docker-compose default) | — | Falls back to `INFO` for unrecognized values. | Python logging level for the backend: `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`. `DEBUG` is verbose and useful during development; use `INFO` or higher in production to avoid logging sensitive request data. Read by `core/logging_config.py` at startup. |

> The `uvicorn.access` logger is fixed at `WARNING` regardless of `LOG_LEVEL`, which suppresses the per-request access log (already covered by nginx). See [logging-backend.md](../backend/logging-backend.md) for the logging conventions.

---

## 4. Docker Compose resource variables

These variables are consumed by `docker-compose.yml` (not by the Python application) and control the hard container limits and optional image tags. They are read from `.env` via Docker Compose variable substitution and cannot be overridden at the application level.

| Variable | Default | Unit | Effect |
|---|---|---|---|
| `R_WORKER_MEM_LIMIT` | `10g` | Docker memory string | Hard cgroup memory ceiling for the R worker container. If the container exceeds this, its cgroup OOM-killer terminates the R process; the host and other services remain unaffected. Must be `≥ PIPELINE_MEMORY_BUDGET_GB` (§3.4) so the soft queue normally engages first. |
| `R_WORKER_CPUS` | `2` | cores (float) | Hard CPU limit for the R worker container. Mirror `PIPELINE_CORE_BUDGET` (§3.4). |
| `BACKEND_MEM_LIMIT` | `1g` | Docker memory string | Hard memory ceiling for the backend (FastAPI) container. The backend holds job state and open file handles but does not do heavy computation; 1 GiB is generous for normal use. |

> For a worked sizing example, see §7. For the full rationale behind the two-layer strategy (soft queue + hard wall), see [docker.md](../deployment/docker.md).

---

## 5. R-worker threading pins

The following environment variables are **hardcoded** in the `r_worker` service block of `docker-compose.yml` and are not intended to be changed. They pin all BLAS/OpenMP threading libraries to a single thread so that R's own parallelism (Bumphunter bootstrap workers, controlled by `DMR_CORES`) is the only form of parallelism active during a pipeline run.

| Variable | Value | Library pinned |
|---|---|---|
| `OMP_NUM_THREADS` | `1` | OpenMP (used by many compiled R packages) |
| `OPENBLAS_NUM_THREADS` | `1` | OpenBLAS (linear algebra) |
| `MKL_NUM_THREADS` | `1` | Intel MKL (alternative BLAS) |
| `BLAS_NUM_THREADS` | `1` | Generic BLAS fallback |

Without these pins, each Bumphunter bootstrap worker would spawn its own thread pool, multiplying actual CPU usage by the number of BLAS threads and overwhelming the container's CPU quota. See [docker.md](../deployment/docker.md) for more detail on the R-worker container configuration.

`PYTHONUNBUFFERED=1` is also hardcoded in the backend service environment to ensure that Python's stdout is line-buffered, which is required for the R progress-event streaming protocol described in [pipeline-progress.md](../architecture/pipeline-progress.md).

---

## 6. Validation behaviour

`config.py` uses four internal helpers to read and validate environment variables. Validation runs at **import time**: if any variable fails its check, the application raises `ValueError` and exits before accepting any requests.

| Helper | Constraint | Applied to |
|---|---|---|
| `_get_positive_float(name, default)` | `value > 0` | `JOB_RETENTION_HOURS`, `STAGING_RETENTION_HOURS`, `PIPELINE_MEMORY_BUDGET_GB`, `PIPELINE_STEP_MEMORY_GB`, `PIPELINE_DMR_MEMORY_GB`, `PIPELINE_DMP_MEMORY_GB` |
| `_get_positive_int(name, default)` | `value > 0` | `JOB_CLEANUP_INTERVAL_SECONDS`, `STAGING_CLEANUP_INTERVAL_SECONDS`, `DMR_CORES`, `PIPELINE_CORE_BUDGET`, `MAX_TOTAL_UPLOAD_MB`, `MAX_SAMPLE_SHEET_MB` |
| `_get_nonneg_int(name, default)` | `value ≥ 0` (0 = disabled) | `MAX_SAMPLES_PER_JOB`, `MIN_FREE_DISK_MB` |
| `_get_nonneg_float(name, default)` | `value ≥ 0` (0 = disabled) | `MAX_JOBS_DISK_GB` |

A non-numeric string always fails regardless of the helper used. `LOG_LEVEL` is not validated — an unrecognized level silently falls back to `INFO`.

---

## 7. Sizing examples

The `.env.example` file contains two worked examples reproduced here.

**Development laptop (16 GiB RAM, shared with IDE and OS)**

```dotenv
R_WORKER_MEM_LIMIT=10g
R_WORKER_CPUS=2
BACKEND_MEM_LIMIT=1g
PIPELINE_MEMORY_BUDGET_GB=8
PIPELINE_CORE_BUDGET=2
PIPELINE_STEP_MEMORY_GB=5
PIPELINE_DMR_MEMORY_GB=6
PIPELINE_DMP_MEMORY_GB=4
DMR_CORES=1
MAX_SAMPLES_PER_JOB=48
```

One job at a time. The soft queue serializes any concurrent uploads. The hard wall ensures the machine never crashes even with the IDE, browser, and OS all running.

**Dedicated server (20 GiB + 5 cores reserved exclusively for this application)**

```dotenv
R_WORKER_MEM_LIMIT=19g
R_WORKER_CPUS=5
BACKEND_MEM_LIMIT=1g
PIPELINE_MEMORY_BUDGET_GB=18
PIPELINE_CORE_BUDGET=5
PIPELINE_STEP_MEMORY_GB=5
PIPELINE_DMR_MEMORY_GB=6
PIPELINE_DMP_MEMORY_GB=4
DMR_CORES=2
MAX_SAMPLES_PER_JOB=48
MAX_JOBS_DISK_GB=200
```

Up to ~3 concurrent DMR runs (18 GiB budget ÷ 6 GiB per DMR). The 19 GiB + 1 GiB hard ceilings sum to exactly the reserved 20 GiB, so no other services on the machine are at risk from memory contention.

---

## 8. Extension points

### Add a new configurable variable

1. Add the variable to `backend/app/core/config.py` using the appropriate helper (`_get_positive_int`, `_get_nonneg_float`, etc.) with a sensible validated default.
2. Export the result as a module-level constant (uppercase, matches the env-var name).
3. Add the variable to `.env.example` with a comment explaining the effect and the acceptable range.
4. Add an `environment` entry to the relevant service in `docker-compose.yml` so the value is passed into the container.
5. Add a row to the appropriate table in this document.

### Change a validation rule

The four helper functions in `config.py` are the only place where validation logic lives. Changing the constraint in the helper is the only change needed; the module re-exports the validated constant and all consumers automatically see the new behaviour.

---

## 9. Cross-links

| Topic | Document |
|---|---|
| Two-layer resource strategy (soft queue + hard container wall), nginx upload limits, R-worker container setup | [docker.md](../deployment/docker.md) |
| Services that consume these configuration constants | [services-reference.md](../backend/services-reference.md) |
| Job retention, cleanup loops, GDPR data-deletion | [job-lifecycle.md](../architecture/job-lifecycle.md) |
| Logging conventions and log levels | [logging-backend.md](../backend/logging-backend.md) |
| R progress-event streaming (why `PYTHONUNBUFFERED` is required) | [pipeline-progress.md](../architecture/pipeline-progress.md) |
