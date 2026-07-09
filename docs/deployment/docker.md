# Deployment: Docker Compose Infrastructure

**Scope:** `docker-compose.yml`, all `Dockerfile`s (`frontend/`, `backend/`, `r_backend/`), `nginx/nginx.conf`, `.env.example`

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Services](#2-services)
  - [2.1 docker-socket-proxy](#21-docker-socket-proxy)
  - [2.2 frontend](#22-frontend)
  - [2.3 backend](#23-backend)
  - [2.4 r\_worker](#24-r_worker)
- [3. Networks](#3-networks)
- [4. Volumes and Mounts](#4-volumes-and-mounts)
- [5. The Docker Socket: Why It Exists and How It Is Contained](#5-the-docker-socket-why-it-exists-and-how-it-is-contained)
- [6. Environment Variables](#6-environment-variables)
- [7. Build Process and Build Times](#7-build-process-and-build-times)
- [8. First Start and Rebuild Behaviour](#8-first-start-and-rebuild-behaviour)
- [9. Health Checks](#9-health-checks)
- [10. Extension Points](#10-extension-points)
- [11. Cross-links](#11-cross-links)

---

## 1. Overview

The application is composed of **four Docker Compose services** that communicate over **three isolated networks**. No service has more access to the host or to other services than the minimum required for its function.

```
Browser
  │  HTTPS :8443 / HTTP :8080 (redirect)
  ▼
┌─────────────────────────────────────────────────┐  frontend-net (bridge)
│  frontend  (nginx, React SPA + TLS termination) │
└────────────────────────┬────────────────────────┘
                         │ http://backend:8000
                         ▼
┌─────────────────────────────────────────────────┐  frontend-net + proxy-net (internal)
│  backend   (FastAPI, job orchestration)         │
└────────────┬────────────────────────────────────┘
             │ tcp://docker-socket-proxy:2375
             ▼
┌────────────────────────────────────────────────┐  proxy-net (internal)
│  docker-socket-proxy  (API gateway, TCP :2375) │
└────────────┬───────────────────────────────────┘
             │ /var/run/docker.sock (read-only)
             │ EXEC / CONTAINERS / POST only
             ▼
┌────────────────────────────────────────────────┐  isolated (internal, no internet)
│  r_worker  (R 4.4.3, Bioconductor, analysis)  │
└────────────────────────────────────────────────┘

Shared host volumes:
  ./jobs       <=>  backend + r_worker  (job artifacts)
  ./r_backend  <=>  backend + r_worker  (R scripts, live-mounted)
  ./data       <=>  r_worker            (reference data)
```

**Key design decisions in brief:**

- The backend does **not** mount the raw Docker socket. It reaches the `r_worker` exclusively through the `docker-socket-proxy`, which restricts the Docker API to exactly the endpoints needed (`CONTAINERS`, `EXEC`, `POST`).
- The `r_worker` is on an **internal-only** network with no internet access.
- All four services run with `cap_drop: ALL` and `no-new-privileges: true`.

For the rationale behind the `docker exec`-based R invocation see [§5](#5-the-docker-socket-why-it-exists-and-how-it-is-contained) and [r-executor.md](../architecture/r-executor.md).

---

## 2. Services

### 2.1 docker-socket-proxy

| Property | Value |
|---|---|
| Image | `tecnativa/docker-socket-proxy:latest` |
| Purpose | Restrict host Docker API access to the minimum needed by the backend |
| Exposed ports | None (accessible only within `proxy-net`) |
| Networks | `proxy-net` (internal) |
| Read-only filesystem | Yes (`read_only: true`) |
| Capabilities | `cap_drop: ALL` |
| Restart policy | `unless-stopped` |

**What it does.** The proxy sits between the backend and the real Docker daemon socket. It forwards only the three API scopes the backend legitimately needs:

| Scope | Why it is needed |
|---|---|
| `CONTAINERS=1` | Resolve the `r_worker` container name to an ID for `docker exec` |
| `EXEC=1` | Create and start exec sessions (`docker exec`) |
| `POST=1` | Exec requests are HTTP POST |

Every other Docker API scope (`IMAGES`, `NETWORKS`, `VOLUMES`, `BUILD`, `INFO`, …) is set to `0` and blocked. The backend cannot pull images, inspect other containers, create networks, or access swarm state.

**tmpfs mounts.** The proxy uses tmpfs for `/tmp`, `/run`, and `/var/lib/haproxy` so that its read-only root filesystem still has the writable scratch space HAProxy requires internally.

> See [§5](#5-the-docker-socket-why-it-exists-and-how-it-is-contained) for the full security discussion.

---

### 2.2 frontend

| Property | Value |
|---|---|
| Base images | `node:26.4.0-alpine` (build stage), `nginxinc/nginx-unprivileged:1.31-alpine` (runtime) |
| Purpose | Serve the React SPA and terminate TLS |
| Exposed ports | `8080` (HTTP => HTTPS redirect), `8443` (HTTPS) |
| Networks | `frontend-net` |
| Read-only filesystem | Yes (`read_only: true`) |
| Capabilities | `cap_drop: ALL` |

**Build stages.** The Dockerfile is a two-stage build:

1. **Build stage** (`node:26.4.0-alpine`): runs `npm ci` and `npm run build` to produce the static `dist/` bundle.
2. **Production stage** (`nginxinc/nginx-unprivileged`): copies the bundle into nginx's document root. The unprivileged image listens on port `8080`/`8443` instead of `80`/`443`, removing the need for any Linux capabilities.

**TLS.** nginx terminates TLS. Certificates are mounted read-only from the host:

```
./certs/bigtom-local.pem     => /etc/nginx/certs/bigtom-local.pem
./certs/bigtom-local-key.pem => /etc/nginx/certs/bigtom-local-key.pem
```

The HTTP server on port `8080` returns a `301` redirect to HTTPS on port `8443`. Details on certificate generation and HTTPS configuration are in [https-nginx.md](./https-nginx.md).

**SPA routing.** nginx is configured with `try_files $uri $uri/ /index.html` so that all client-side routes (e.g. `/results/abc123`) fall back to `index.html` and React Router handles navigation.

**API proxy.** All requests to `/api/` are proxied to `http://backend:8000`. nginx adds `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers. Timeouts are set to accommodate long-running analyses:

| Setting | Value |
|---|---|
| `client_max_body_size` | `1400M` (covers the largest expected IDAT uploads) |
| `proxy_read_timeout` | `500s` |
| `proxy_connect_timeout` | `300s` |

**tmpfs mounts.** Because the container filesystem is read-only, nginx's temporary directories are provided as `tmpfs`:

| Mount path | Size | Purpose |
|---|---|---|
| `/tmp` | 512 M | Client body buffer for large file uploads |
| `/var/cache/nginx` | 64 M | nginx proxy cache |
| `/var/run` | 16 M | nginx PID file and socket |
| `/etc/nginx/conf.d` | 10 M | Runtime nginx snippets |

**Rate limiting.** nginx defines per-IP rate-limit zones for each API endpoint group. These are a defence-in-depth measure against excessive polling or upload abuse; they do not replace backend-level validation.

| Zone | Rate | Applied to |
|---|---|---|
| `upload_zone` | 6 req/min | `POST /api/v1/upload` |
| `status_zone` | 25 req/min | `GET /api/v1/status/` |
| `light_zone` | 30 req/min | Filter stats, SVD plot retrieval, lightweight GETs |
| `medium_zone` | 20 req/min | Normalization preview assets, heatmap |
| `strict_zone` | 5 req/min | Normalize, batch skip, reset (state-changing) |
| `batch_zone` | 10 req/min | Batch correction submissions |
| `table_zone` | 30 req/min | DMP/DMR table pagination |
| `export_zone` | 10 req/min | CSV export |

Requests that exceed the limit receive an RFC 9457-compatible `429` response.

---

### 2.3 backend

| Property | Value |
|---|---|
| Base image | `python:3.11.15-slim` |
| Purpose | FastAPI REST API, job orchestration, R invocation |
| Exposed ports | `8000` |
| Networks | `frontend-net`, `proxy-net` |
| User | `1000:1000` (non-root) |
| Capabilities | `cap_drop: ALL` |
| Memory limit | `${BACKEND_MEM_LIMIT:-1g}` |

**Docker CLI in the image.** The Dockerfile downloads the official Docker CLI binary (`docker-29.6.1`) directly from `download.docker.com` and installs it at `/usr/local/bin/docker`. This gives the backend the `docker` command needed to issue `docker exec` calls, without installing the full Docker Engine or daemon.

> The backend does **not** mount `/var/run/docker.sock`. It communicates with the proxy over `DOCKER_HOST=tcp://docker-socket-proxy:2375`, so the container itself has no socket file at all.

**Runtime user.** The container starts as a dedicated non-root system user (`app:app` in the image, `1000:1000` in Compose). The application files are owned by `app` so the process can read them, but the root filesystem is otherwise inaccessible to the process.

**Memory limit.** The backend only orchestrates: it holds in-memory job state and issues `docker exec` calls. It does **not** load R data or biological datasets. A limit of `1g` is ample and prevents a memory leak from affecting other services or the host.

**Volume mounts:**

| Host path | Container path | Purpose |
|---|---|---|
| `./jobs` | `/app/jobs` | Shared job artifact directory (read and write) |
| `./r_backend` | `/app/r_backend` | R scripts, live-mounted so script changes are picked up without a rebuild |

> The `./jobs` volume is the sole data-exchange channel between backend and `r_worker`. Its structure is described in [job-directory-layout.md](../contracts/job-directory-layout.md).

---

### 2.4 r\_worker

| Property | Value |
|---|---|
| Base image | `rocker/r-ver:4.4.3` |
| Purpose | Execute R analysis scripts (filtering, normalization, batch, DMP, DMR, heatmap) |
| Exposed ports | **None** |
| Networks | `isolated` (internal, no internet) |
| User | `1000:1000` (non-root) |
| Capabilities | `cap_drop: ALL` |
| Memory limit | `${R_WORKER_MEM_LIMIT:-10g}` |
| CPU limit | `${R_WORKER_CPUS:-2}` |

#### Keep-alive command

The `r_worker` runs:

```yaml
command: tail -f /dev/null
```

The container exists solely as an execution environment. It has no long-running server process of its own. The backend starts each analysis step with `docker exec <r_worker_container> Rscript ...`; the `tail -f /dev/null` keeps the container alive between invocations.

#### Hard resource limits

```yaml
mem_limit: ${R_WORKER_MEM_LIMIT:-10g}
cpus:      ${R_WORKER_CPUS:-2}
```

These are **container-level hard walls enforced by the cgroup**. If an R process exceeds `mem_limit`, the container's own OOM-killer terminates that process. The host and all other services remain unaffected.

This is the last-resort protection. The backend's [Resource Governor](../architecture/backend-architecture.md#resource-governor) provides a software admission queue that acts before the hard limit is reached, preventing multiple concurrent jobs from collectively approaching the ceiling. See [§6](#6-environment-variables) for how to size these values relative to the software budget.

#### ulimits

```yaml
ulimits:
  nproc:   { soft: 65536, hard: 65536 }
  nofile:  { soft: 65536, hard: 65536 }
  stack:   67108864  # 64 MiB
```

| Limit | Reason |
|---|---|
| `nproc` / `nofile` | R's parallel workers, BiocParallel, and large matrix operations open many file descriptors and may fork child processes. The defaults on some hosts are too low. |
| `stack` | 64 MiB stack prevents stack overflow in deeply recursive statistical computations (e.g. Bumphunter recursion during DMR analysis). |

#### Threading constraints

All threading environment variables are pinned to `1` to prevent unbounded thread proliferation:

```yaml
environment:
  - OMP_NUM_THREADS=1
  - OPENBLAS_NUM_THREADS=1
  - MKL_NUM_THREADS=1
  - BLAS_NUM_THREADS=1
  - BIOCPARALLEL_WORKER_NUMBER=1
  - R_BIOC_PARALLEL_WORKERS=1
```

**Why.** R's numerical libraries (OpenBLAS, MKL, OpenMP) default to creating as many threads as the host has cores. Inside a container with a CPU cap, this causes thread contention and unpredictable scheduling. More critically, Bumphunter (DMR analysis) uses its own fork-based parallelism whose worker count is controlled separately via `DMR_CORES` (see [§6](#6-environment-variables)). Setting all threading variables to `1` ensures that the only parallelism that occurs is the deliberately sized Bumphunter fork pool.

#### Installed R packages

The R worker image contains a full Bioconductor stack built at image creation time:

| Package group | Packages |
|---|---|
| Core analysis | `minfi`, `limma`, `sva` (ComBat), `bumphunter`, `DMRcate` |
| Pipeline framework | `ChAMP`, `ChAMPdata` (GitHub patch — see below) |
| Array annotation (450K) | `IlluminaHumanMethylation450kmanifest`, `IlluminaHumanMethylation450kanno.ilmn12.hg19` |
| Array annotation (EPICv1) | `IlluminaHumanMethylationEPICmanifest`, `IlluminaHumanMethylationEPICanno.ilm10b4.hg19` |
| Array annotation (EPICv2) | `IlluminaHumanMethylationEPICv2manifest`, `IlluminaHumanMethylationEPICv2anno.20a1.hg38` |
| Visualisation | `ComplexHeatmap` |
| Utilities | `data.table`, `readxl`, `tidyverse`, `RhpcBLASctl`, `logger`, `progressr`, `remotes` |

**ChAMP GitHub patch.** The CRAN/Bioconductor release of `ChAMPdata` lacks the `probe.features` annotation for EPICv2. The Dockerfile installs patched versions of both `ChAMPdata` and `ChAMP` directly from `YuanTian1991/ChAMP` and `YuanTian1991/ChAMPdata` on GitHub.

**preprocessCore threading fix.** `preprocessCore` must be compiled with `--disable-threading` to prevent crashes during quantile normalisation inside a Docker container. This is applied before installing ChAMP.

**Build-time verification.** The final `RUN` step in the Dockerfile loads ChAMP, minfi, and all six annotation packages and prints `OK` for each. If any package is missing, the Docker build fails — it is impossible to ship an image without full 450K / EPICv1 / EPICv2 support.

---

## 3. Networks

| Network | Driver | `internal` | Connected services | Purpose |
|---|---|---|---|---|
| `frontend-net` | `bridge` | No | `frontend`, `backend` | Frontend-to-backend HTTP traffic; the only network reachable from outside |
| `proxy-net` | `bridge` | **Yes** | `backend`, `docker-socket-proxy` | Isolated control plane for Docker API calls; no internet access |
| `isolated` | `bridge` | **Yes** | `r_worker` | Complete network isolation for R; no inbound or outbound internet |

`internal: true` means Docker adds no default gateway and no outbound NAT. A container on an internal network can only reach other containers on the **same** network.

The `r_worker` is intentionally on `isolated` only. It cannot initiate any network connection — not to the backend, not to the internet. All communication is via the shared `./jobs` volume and `docker exec` stdin/stdout.

---

## 4. Volumes and Mounts

### 4.1 Shared host-bind mounts

| Host path | Mounted in | Container path | Access | Purpose |
|---|---|---|---|---|
| `./jobs` | `backend` | `/app/jobs` | Read + Write | Job artifact store: IDAT uploads, RDS checkpoints, filter stats, plots, result tables |
| `./jobs` | `r_worker` | `/app/jobs` | Read + Write | Same directory; R scripts write artifacts here, backend reads them |
| `./r_backend` | `backend` | `/app/r_backend` | Read | The backend passes R script paths to `docker exec`; it does not execute R itself |
| `./r_backend` | `r_worker` | `/app/r_backend` | Read + Write | R scripts and shared utilities live here; live-mounted so changes take effect without rebuilding |
| `./data` | `r_worker` | `/app/data` | Read | Static reference data made available to R scripts (currently used for test data) |
| `./certs/bigtom-local.pem` | `frontend` | `/etc/nginx/certs/bigtom-local.pem` | Read-only | TLS certificate for nginx |
| `./certs/bigtom-local-key.pem` | `frontend` | `/etc/nginx/certs/bigtom-local-key.pem` | Read-only | TLS private key for nginx |

### 4.2 The jobs directory as the R↔backend data contract

`./jobs/<job_id>/` is the **only** channel through which R scripts return results to the backend. The backend never inspects R's stdout for data (only for structured progress events). Every artifact an R script produces — RDS checkpoints, JSON metadata, PNG plots, CSV tables — is written to a known path within `./jobs/<job_id>/` and read back by the corresponding backend route.

The full file tree and the ownership of each artifact (which service writes it, which reads it) are specified in [job-directory-layout.md](../contracts/job-directory-layout.md).

### 4.3 The r_backend live mount

`./r_backend` is mounted into both `backend` and `r_worker` at runtime. This means:

- R script changes are picked up **immediately** without an image rebuild.
- The backend can reference script paths (e.g. `/app/r_backend/init_filter.R`) knowing they exist in the `r_worker` container under the same path.
- The mount is **read** in the backend (path construction only) and **read-write** in the `r_worker` (R scripts may write temporary files, though the canonical outputs go to `./jobs`).

---

## 5. The Docker Socket: Why It Exists and How It Is Contained

### 5.1 Why the backend needs to execute R

The backend is a Python/FastAPI process. All numerical computation is delegated to R scripts that run inside the `r_worker` container. The invocation mechanism is `docker exec`:

```
backend  =>  docker exec r_worker Rscript /app/r_backend/init_filter.R <args>
```

This requires the backend to have programmatic access to the Docker API to create and start an exec session on the `r_worker` container. See [r-executor.md](../architecture/r-executor.md) for the full executor design.

### 5.2 Why the raw socket is not mounted

Mounting `/var/run/docker.sock` directly into a container grants it **full, unrestricted control of the Docker daemon**: it can pull arbitrary images, create or destroy containers, mount host directories, or inspect all running containers. This is equivalent to root access on the host and is unacceptable for a service that handles patient data.

### 5.3 How the socket proxy mitigates this

The `docker-socket-proxy` service (based on `tecnativa/docker-socket-proxy`) acts as an API gateway between the backend and the real socket:

```
backend  =>  TCP :2375  =>  docker-socket-proxy  =>  /var/run/docker.sock (read-only)
                            (allows only CONTAINERS + EXEC + POST)
```

Only three API capabilities are enabled:

| Capability | Required for |
|---|---|
| `CONTAINERS=1` | Look up the `r_worker` container by label to obtain its ID |
| `EXEC=1` | Create an exec session (`POST /containers/{id}/exec`) |
| `POST=1` | Exec endpoints use HTTP POST |

Everything else returns `403 Forbidden`. The backend **cannot**: pull or push images, create/remove containers or networks, access volumes, read logs of other containers, query swarm or system state.

The proxy itself:
- mounts the real socket **read-only** (`/var/run/docker.sock:ro`)
- runs with `read_only: true` and `cap_drop: ALL`
- is reachable only from `proxy-net` (an internal network)

### 5.4 Residual risk

Even with the proxy, the backend can trigger arbitrary `Rscript` command lines inside the `r_worker`. An adversary who achieves arbitrary code execution in the backend could launch malicious R code. Mitigations:

- The `r_worker` has **no network access** (`isolated` network) and cannot exfiltrate data over the network.
- The `r_worker` has hard memory and CPU limits, limiting resource abuse.
- All R script arguments are constructed from validated, sanitised backend state (job IDs, method names from an allowlist), not from raw user input.
- The backend itself runs as a non-root user with `cap_drop: ALL`.

---

## 6. Environment Variables

All tunables are read from environment variables with safe defaults. Copy `.env.example` to `.env` before the first start; Docker Compose reads `.env` automatically.

> A complete reference table (name, type, default, unit, validation rule, effect) will be maintained in [`docs/backend/configuration.md`](../backend/configuration.md) once that document exists. The subsections below cover the variables most relevant to deployment sizing.

### 6.1 Resource budget (most important for sizing)

The application protects itself with two independent layers:

1. **Hard container wall** — `mem_limit` / `cpus` in Compose. Enforced by the host cgroup. If exceeded, the cgroup OOM-killer terminates the offending R process; the host and other containers are unaffected.
2. **Soft admission queue** — `PIPELINE_MEMORY_BUDGET_GB` / `PIPELINE_CORE_BUDGET`. Enforced by the backend's Resource Governor in software. A new R step only starts if its estimated cost fits within the remaining budget; otherwise it waits. This is the primary throttle; the hard wall is the backstop.

**Golden rule:** `PIPELINE_MEMORY_BUDGET_GB` must be ≤ `R_WORKER_MEM_LIMIT` so the soft queue engages before the hard wall does.

| Variable | Default | Unit | Description |
|---|---|---|---|
| `R_WORKER_MEM_LIMIT` | `10g` | Docker mem syntax | Hard memory ceiling for the `r_worker` container |
| `R_WORKER_CPUS` | `2` | cores | Hard CPU limit for `r_worker` |
| `BACKEND_MEM_LIMIT` | `1g` | Docker mem syntax | Hard memory ceiling for the `backend` container |
| `PIPELINE_MEMORY_BUDGET_GB` | `8` | GiB | Soft total memory budget across all concurrent R steps |
| `PIPELINE_CORE_BUDGET` | `2` | cores | Soft total CPU budget |
| `PIPELINE_STEP_MEMORY_GB` | `5` | GiB | Estimated peak memory for most pipeline steps |
| `PIPELINE_DMR_MEMORY_GB` | `6` | GiB | Estimated peak memory for DMR (Bumphunter bootstrap) |
| `PIPELINE_DMP_MEMORY_GB` | `4` | GiB | Estimated peak memory for DMP (limma) |
| `DMR_CORES` | `1` | cores | Fork workers for Bumphunter bootstrap; each worker holds a full copy of the beta matrix — RAM scales linearly with this value |

**Sizing examples (from `.env.example`):**

*Development laptop (16 GiB, shares RAM with OS/IDE, ~10 GiB available):*
```env
R_WORKER_MEM_LIMIT=10g   R_WORKER_CPUS=2
PIPELINE_MEMORY_BUDGET_GB=8   PIPELINE_CORE_BUDGET=2   DMR_CORES=1
```
One analysis job at a time. Never crashes the machine even with the IDE and browser open.

*Dedicated server (20 GiB + 5 cores reserved for MethylAnalyzer):*
```env
R_WORKER_MEM_LIMIT=19g   R_WORKER_CPUS=5   BACKEND_MEM_LIMIT=1g
PIPELINE_MEMORY_BUDGET_GB=18   PIPELINE_CORE_BUDGET=5
PIPELINE_DMR_MEMORY_GB=6   DMR_CORES=2
```
Approximately 3 concurrent DMR analyses (18 GiB / 6 GiB per DMR). The hard 19 GiB ceiling guarantees other applications are never OOM-killed.

### 6.2 Job lifecycle and cleanup

| Variable | Default | Description |
|---|---|---|
| `JOB_BASE_DIR` | `/app/jobs` | Root directory for all job artifacts |
| `JOB_RETENTION_HOURS` | `24` | Hours before a job directory is considered expired and deleted |
| `JOB_CLEANUP_INTERVAL_SECONDS` | `86400` | How often the cleanup loop runs (once per day) |
| `STAGING_RETENTION_HOURS` | `2` | TTL for uncommitted staged uploads |
| `STAGING_CLEANUP_INTERVAL_SECONDS` | `900` | Staging cleanup loop interval (15 minutes) |

### 6.3 Intake guards

| Variable | Default | Description |
|---|---|---|
| `MAX_SAMPLES_PER_JOB` | `48` | Maximum IDAT pairs per job; rejects oversized uploads before they start |
| `MAX_JOBS_DISK_GB` | `0` (disabled) | Total disk cap for all job directories; set this on production deployments |
| `MAX_TOTAL_UPLOAD_MB` | `900` | Maximum combined IDAT file size per upload |
| `MAX_SAMPLE_SHEET_MB` | `10` | Maximum sample sheet size |

### 6.4 Network and security

| Variable | Default | Description |
|---|---|---|
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated list of allowed browser origins; **set to the deployed frontend URL in production** |
| `LOG_LEVEL` | `INFO` | Python logging level (`DEBUG` / `INFO` / `WARNING` / `ERROR`) |

---

## 7. Build Process and Build Times

### 7.1 frontend

| Step | What happens |
|---|---|
| Stage 1 (build) | `node:26.4.0-alpine`: `npm ci` installs dependencies, `npm run build` produces `dist/` via Vite |
| Stage 2 (production) | `nginxinc/nginx-unprivileged:1.31-alpine`: copies `dist/` and the nginx config; no runtime dependencies to install |

**Typical build time:** 2–5 minutes on a developer machine. Layer caching means repeated builds are near-instant when only source files change and `package.json` / `package-lock.json` are unchanged.

### 7.2 backend

| Step | What happens |
|---|---|
| Base image | `python:3.11.15-slim` |
| System packages | Installs `curl` and `ca-certificates`, downloads the Docker CLI binary (`docker-29.6.1`), then removes the packages |
| Python dependencies | `pip install -r requirements.txt` |
| Application code | `COPY . .` |

**Typical build time:** 2–5 minutes. The Docker CLI download is the slowest step on a cold cache.

### 7.3 r\_worker

The R worker image is by far the most expensive to build due to the Bioconductor package ecosystem.

| Step | Approximate time | Notes |
|---|---|---|
| System dependencies (`apt-get`) | 1–3 min | libcurl, libssl, libxml2, graphics libraries, HDF5 |
| `BiocManager` installation | 1–2 min | |
| `preprocessCore` (threading fix) | 2–5 min | Must be compiled from source with `--disable-threading` |
| Illumina array annotation packages | 10–20 min | EPICv2 annotation alone is several hundred MiB; download timeout is extended to 1200 s |
| `ChAMP` + all dependencies | 10–20 min | Pulls minfi, limma, sva, DMRcate, and their transitive dependencies |
| `ComplexHeatmap`, `data.table`, etc. | 2–5 min | |
| GitHub-patched `ChAMP`/`ChAMPdata` | 3–8 min | |
| Verification step | < 1 min | Loads all six annotation packages; build fails if any are missing |

**Cold build: 40–60 minutes** on a typical developer machine or CI runner.

**Warm build (cached layers):** If only R scripts or utilities change (no Dockerfile change), Docker uses the cached layers for all package installation steps. A hot rebuild then takes only seconds.

**Practical advice:** Run `docker compose build r_worker` once and commit the result to a local or CI registry. Tag it with the Dockerfile's content hash so rebuilds are only triggered when the Dockerfile actually changes.

---

## 8. First Start and Rebuild Behaviour

### 8.1 First start

```bash
# 1. Generate TLS certificates (required before starting)
./scripts/generate-dev-certificate.ps1   # Windows/PowerShell
# or the equivalent mkcert commands on Linux/macOS

# 2. Copy and edit the environment file
cp .env.example .env
# Edit .env to match the deployment machine's resources

# 3. Build all images (expect 40–60 min for r_worker on first run)
docker compose build

# 4. Start all services
docker compose up -d

# 5. Verify
docker compose ps
docker compose logs backend   # expect: "Application startup complete"
docker compose logs r_worker  # expect: container running, no errors
```

The application is available at `https://localhost:8443` (or the configured host port) once all four services report as running.

### 8.2 Startup dependencies and order

`docker-compose.yml` defines the following dependency graph:

```
r_worker
docker-socket-proxy
   └── backend (depends_on: docker-socket-proxy, r_worker)
         └── frontend (depends_on: backend)
```

`depends_on` in Compose v2 only waits for the container to **start**, not for the application inside to be **ready**. The backend retries the Docker connection internally; no manual sequencing is needed in practice.

### 8.3 Rebuilding after changes

| What changed | Rebuild needed | Command |
|---|---|---|
| Frontend source (`.tsx`, `.ts`, `.css`) | Yes, `frontend` only | `docker compose build frontend && docker compose up -d frontend` |
| Backend Python source | Yes, `backend` only | `docker compose build backend && docker compose up -d backend` |
| R scripts under `r_backend/` | **No** — live-mounted | Changes are picked up immediately without any restart |
| `r_backend/` R packages or Dockerfile | Yes, `r_worker` only | `docker compose build r_worker && docker compose up -d r_worker` |
| `nginx/nginx.conf` | Yes, `frontend` only | `docker compose build frontend && docker compose up -d frontend` |
| `docker-compose.yml` (service config) | No rebuild, but re-up | `docker compose up -d` |
| `.env` values | No rebuild, restart services | `docker compose up -d` |

> **Note on r_backend live mount.** Because `./r_backend` is mounted into both `backend` and `r_worker` at runtime, editing an R script on the host is visible to the `r_worker` container on the next `docker exec` call — no container restart or rebuild required. This is intentional for rapid iteration on analysis scripts.

### 8.4 Stopping and data retention

```bash
docker compose down          # stops and removes containers; volumes are NOT deleted
docker compose down -v       # also deletes named volumes (not applicable here — only bind mounts are used)
```

Job artifacts persist in `./jobs` across restarts. However, the backend's **in-memory job state** (phase, status, progress) is lost when the backend container restarts. File artifacts remain on disk but are not automatically reconnected to in-memory state. This is a known architectural constraint documented in [job-lifecycle.md](../architecture/job-lifecycle.md).

---

## 9. Health Checks

No health check probes are currently configured in `docker-compose.yml`.

The backend exposes `GET /health` (returns `200 OK` with `{"status": "ok"}`) which can be used as a liveness probe. This endpoint is defined in `backend/app/main.py`.

To add a health check for the backend in `docker-compose.yml`:

```yaml
backend:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s
```

This is not yet done because:
- The `curl` binary is not present in the backend image (it is removed after the Docker CLI download to keep the image small).
- The `r_worker` has no meaningful health endpoint to probe.

If health checks are added in future, the backend image would need a lightweight HTTP client (e.g. `wget` from `busybox`) or the health check could use a Python one-liner.

---

## 10. Extension Points

### Adding a new service

1. Define the service in `docker-compose.yml` following the existing security template: `cap_drop: ALL`, `no-new-privileges: true`, appropriate `networks`, and a non-root `user`.
2. Assign it to the most restrictive network that satisfies its connectivity needs. A service that only receives calls from the backend does not need to be on `frontend-net`.
3. If the service needs to be reached by `r_worker`, note that `r_worker` is on the `isolated` network with no outbound connectivity — communication must flow through the shared `./jobs` volume or via the backend.

### Changing resource limits

Resource limits are fully driven by environment variables (§6.1). No Dockerfile or Compose changes are needed — edit `.env` and `docker compose up -d` to apply.

### Adding a volume

If a new R script or backend service needs additional persistent storage:

1. Define the host path and add the bind mount to both services that share it (if any).
2. Document the new path in [job-directory-layout.md](../contracts/job-directory-layout.md).
3. Ensure the cleanup logic in `job_cleanup_service.py` or `staging_manager.py` covers the new path if it holds per-job data.

### Changing the nginx configuration

`nginx/nginx.conf` is copied into the `frontend` image at build time. Changes require a `frontend` image rebuild. Rate limit zones are defined in the `http {}` block; adding a new endpoint rate-limited zone follows the existing pattern (define a `limit_req_zone`, then apply `limit_req` in the matching `location` block).

