# How to Test BigTom

## 1. Purpose and Scope

This guide explains how to test the current BigTom/MethylAnalyzer project from a fresh checkout and documents the additional dependencies, prepared job state, and biological test data required for integration tests. It covers automated backend, frontend, and R tests; manual API tests; Docker-based execution; local execution without Docker; end-to-end workflow validation; and log/error analysis.

The guide is based on the repository files `docker-compose.yml`, `.env.example`, `backend/`, `frontend/app/`, `r_backend/`, and the existing test files.

## 2. System Components

| Component | Confirmed technology | Repository location | Docker Compose service |
|---|---|---|---|
| Frontend | React, TypeScript, Vite, Vitest, nginx | `frontend/app/`, `frontend/` | `frontend` |
| Backend | FastAPI, Python, Pytest, Uvicorn | `backend/` | `backend` |
| R worker/backend | Standalone R scripts, testthat tests, Bioconductor packages | `r_backend/` | `r_worker` |
| Infrastructure | Docker Compose | `docker-compose.yml` | `frontend`, `backend`, `r_worker` |

The backend calls R scripts in the `r_worker` container through Docker commands. The backend container mounts `/var/run/docker.sock`, `./jobs:/app/jobs`, and `./r_backend:/app/r_backend`.

## 3. Prerequisites

Run these commands before testing:

```bash
git --version
docker --version
docker compose version
node --version
npm --version
python --version
curl --version
```

For local R execution, also verify:

```bash
Rscript --version
```

Do not assume a fixed local version unless the repository defines one. The Dockerfiles define Python `3.11-slim`, Node `20-alpine`, and R `rocker/r-ver:4.4.3`.

## 4. Required Test Data

The upload workflow requires:

- IDAT files with `.idat` extension.
- Green/Red IDAT pairs. The frontend validates names ending in `_Grn.idat` and `_Red.idat`, case-insensitively.
- A Sample Sheet uploaded as `sample_sheet`.
- Sample Sheet formats accepted by the backend API: `.csv`, `.xlsx`, `.xls`.
- Sample Sheet formats accepted by the current frontend file picker: `.csv`, `.xlsx`.

The frontend also checks the browser-reported MIME type for Sample Sheets. A direct API request can still use `.xls` if the backend content checks pass.

Important confirmed limits and behavior:

- Backend IDAT total upload limit: `900 MB`, from `backend/app/services/file_handler.py`.
- Backend Sample Sheet limit: `10 MB`.
- nginx proxy upload limit: `1400M`, from `frontend/nginx.conf`.
- Uploaded Sample Sheets are saved in the job directory as `SampleSheet.csv`.
- Uploaded jobs are stored under `JOB_BASE_DIR`; Docker sets it to `/app/jobs` by default and mounts host `./jobs`.
- `.env.example` defines `JOB_BASE_DIR=/app/jobs`, `JOB_RETENTION_HOURS=24`, and `JOB_CLEANUP_INTERVAL_SECONDS=86400`.

Existing test data status in this checkout:

- `data/` exists but is empty in the inspected checkout.
- `backend/tests/conftest.py` references `backend/tests/data/206891110005` and `backend/tests/data/Demo_EPIC-8v2-0_A1_SampleSheet_16.csv`, which are not present in this checkout.
- `backend/tests/test_upload.py` can create minimal synthetic job files when required by upload tests.
- Some integration tests require prepared job directories under `jobs/` or `/app/jobs/` and real methylation data.

Unit or synthetic-data tests may run directly from a fresh checkout once their declared dependencies are installed. Integration tests may additionally require valid Green/Red IDAT pairs, a compatible Sample Sheet, generated `.rds` files from earlier workflow steps, or prepared job directories. The project is still under active development, so do not assume every integration test is expected to pass immediately from a fresh checkout.

Do not commit private IDAT data. Use small, non-sensitive test data where possible, and keep large/private datasets outside Git.

## 5. Docker-Based Test Environment

Build and start all services:

```bash
docker compose up --build
```

Start in the background:

```bash
docker compose up -d --build
```

Check service status:

```bash
docker compose ps
```

View all logs:

```bash
docker compose logs
```

Stream logs:

```bash
docker compose logs -f
```

View one service:

```bash
docker compose logs backend
docker compose logs frontend
docker compose logs r_worker
```

Stop the environment:

```bash
docker compose down
```

Rebuild after dependency changes:

```bash
docker compose build backend
docker compose build frontend
docker compose build r_worker
docker compose up -d
```

Frontend Docker architecture:

- `frontend/Dockerfile` uses a multi-stage production build.
- The build stage is `node:20-alpine`; it installs npm dependencies and runs `npm run build`.
- The final runtime image is `nginx:alpine`; it serves the compiled files from `/usr/share/nginx/html`.
- The running `frontend` service contains nginx, but not Node.js or npm.
- Do not run Vitest, ESLint, or npm build commands with `docker compose exec frontend`; use local execution from `frontend/app` or the temporary Node container shown in Section 7.

Remove containers and volumes:

```bash
docker compose down -v
```

Warning: `docker compose down -v` deletes Docker-managed volumes. This project also writes job data to the bind-mounted host directory `./jobs`, which is not removed by `down -v`.

## 6. Backend Tests with Pytest

The backend container runs as `user: "1000:1000"` (see `docker-compose.yml`). Always run `pytest` without `--user root`, otherwise the job-directory creation inside `/app/jobs` fails with a permission error in rootless Docker. Only `pip install` needs root.

Install test dependencies (run only when `requirements-dev.txt` changes):

```bash
docker compose exec --user root backend pip install --no-cache-dir -r requirements-dev.txt
```

Run all backend tests inside Docker:

```bash
docker compose exec backend python -m pytest tests/ -v
```

Stop on the first failure:

```bash
docker compose exec backend python -m pytest tests/ -v -x
```

Short tracebacks:

```bash
docker compose exec backend python -m pytest tests/ --tb=short
```

Run one test file:

```bash
docker compose exec backend python -m pytest tests/test_upload.py -v
```

Run one specific test:

```bash
docker compose exec backend python -m pytest tests/test_upload.py::TestUpload::test_upload_success -v
```

Expected output: `314 passed, 1 skipped`.

The skipped test is `tests/test_deploy_config.py` (audit B-1/N-1 regression guard): it locates `docker-compose.yml` relative to the test file and skips with `allow_module_level=True` when the file is not found. Inside the backend container, only the `backend/` directory is copied — the repo root is not present. To run the test, execute it locally with Python 3.11 and `PYTHONPATH=backend` pointing at the repository root, or include it in a CI job that checks out the full repository.

Known tolerable warnings:

- `StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated` — comes from the installed FastAPI/Starlette package version, not from project code. No action needed.

Success condition: exit code `0` and a Pytest summary with all selected tests passing or skipped. A non-zero exit code means at least one test failed or collection failed. Do not report the backend suite as passing until the command has been run and exits with `0`.

## 7. Frontend Tests with Vitest

Run frontend tests from the repository root by changing into the frontend app directory:

```bash
cd frontend/app
```

Install dependencies reproducibly from `package-lock.json`:

```bash
npm ci
```

`npm ci` performs a clean install based on `package-lock.json`. Use it for reproducible validation and CI-like execution. Use `npm install` only when intentionally updating dependencies.

Run Vitest in watch mode:

```bash
npm test
```

Run all Vitest tests once:

```bash
npm test -- --run
```

Run one test file once:

```bash
npm test -- --run src/features/upload/tests/UploadView.test.tsx
```

Lint:

```bash
npm run lint
```

TypeScript and production build validation:

```bash
npm run build
```

`npm test` starts Vitest watch mode and keeps the process open for interactive reruns. `npm test -- --run` runs once and exits, which is the better command for CI and Merge Request checks.

PowerShell uses the same commands in this section:

```powershell
cd frontend/app
npm ci
npm test -- --run
npm run lint
npm run build
```

Optional Docker-based frontend test execution uses a temporary Node container, not the running nginx-based `frontend` service:

```bash
docker run --rm \
  -v "$PWD/frontend/app:/app" \
  -v /app/node_modules \
  -w /app \
  node:20-alpine \
  sh -c "npm ci && npm test -- --run"
```

PowerShell:

```powershell
docker run --rm `
  -v "${PWD}/frontend/app:/app" `
  -v /app/node_modules `
  -w /app `
  node:20-alpine `
  sh -c "npm ci && npm test -- --run"
```

The anonymous `/app/node_modules` volume is isolated inside Docker, so Linux dependencies installed by `npm ci` do not overwrite the host installation.

Success condition: Vitest exits with code `0`, lint exits with code `0`, and `npm run build` creates `frontend/app/dist`. These are success criteria, not a claim that the current checkout already satisfies every command.

## 8. R Tests with testthat

The R component is a collection of standalone scripts, not an R package. There is no `DESCRIPTION` file or package-level `devtools::test()` setup.

The R test suite requires the `testthat` package. Verify whether it is installed in the running `r_worker` container:

```bash
docker compose exec r_worker Rscript -e \
  "cat(requireNamespace('testthat', quietly = TRUE))"
```

If the command prints `FALSE`, the image must be rebuilt. The r_worker runs on an isolated internal network (`isolated: internal: true` in `docker-compose.yml`) and has **no internet access at runtime**, so `install.packages` cannot reach CRAN even with `--user root`. Additionally, the container runs as a non-root user (`ruser`), so the system library is not writable without `--user root`. Both constraints mean that runtime package installation is not viable — the only reliable path is to add the package to the Dockerfile and rebuild:

```bash
# Add 'testthat' to r_backend/Dockerfile (already done as of this writing),
# then rebuild the image:
docker compose build r_worker
docker compose up -d r_worker
```

After the rebuild, the verification command above should print `TRUE`.

Run all R tests inside Docker. The command sets the R working directory to `/app/r_backend` because some tests execute scripts by relative filename:

```bash
docker compose exec r_worker Rscript -e "setwd('/app/r_backend'); testthat::test_dir('tests')"
```

Run one R test file inside Docker:

```bash
docker compose exec r_worker Rscript -e "setwd('/app/r_backend'); testthat::test_file('tests/test_batch_svd.R')"
```

Required R packages include packages loaded by the tests and scripts, such as `testthat`, `jsonlite`, `readr`, `minfi`, `ChAMP`, `limma`, `ComplexHeatmap`, `ggplot2`, and Bioconductor annotation packages installed in `r_backend/Dockerfile`.

Typical dependency failures:

- `there is no package called 'testthat'`: `testthat` is not included in the current R image declaration. Install it temporarily for validation as shown above, or add it permanently to the R image in a separate infrastructure/code ticket.
- A declared package is missing after a stale or broken image build: rebuild `r_worker`.
- `there is no package called 'minfi'` or `ChAMP`: these are declared in the R image; rebuild `r_worker` and inspect the build output if they remain missing.
- File-not-found errors under `/app/jobs/...`: provide valid mounted test data in `./jobs` on the host.

Some R tests use synthetic data and can run once the R dependencies are installed. Integration-oriented tests require additional prepared state, such as matching Green/Red IDAT pairs, a compatible Sample Sheet, files mounted under `/app/jobs/{job_id}`, or generated `.rds` files from earlier workflow steps.

The project is still under active development. Do not assume every R integration test is immediately executable or expected to pass from a fresh repository checkout. Keep exact current validation results, temporary job IDs, and detailed failing-test output in the Merge Request or ticket comment instead of this permanent guide.

Success condition: `testthat` prints passing tests and exits with code `0`.

## 9. End-to-End Tests with Playwright

The `e2e/` directory contains a Playwright test suite that runs against the **complete running stack** (nginx + backend + R worker). It proves the full request path end-to-end: from the browser and HTTP API contract, through the R pipeline, to populated result tables.

### 9.1 Suite overview

| File | Tags | What it covers |
|---|---|---|
| `tests/api/health.spec.ts` | fast | Frontend SPA loads; backend reachable via nginx /api proxy |
| `tests/api/errors.spec.ts` | fast | RFC 9457 error contract for 404/400 cases |
| `tests/api/batch-validation.spec.ts` | fast | Batch-correction input validation (synthetic job dir, no pipeline) |
| `tests/ui/smoke.spec.ts` | fast | SPA renders, navigation, file inputs, privacy page, 404 fallback |
| `tests/api/reset.spec.ts` | @slow | Real upload → immediate reset; proves job cancellation |
| `tests/api/pipeline.spec.ts` | @slow | Full pipeline: upload → filtering → normalization → SVD → analysis → tables |

Fast tests complete in under 15 seconds. `@slow` tests drive the R pipeline and take 10–20 minutes with a real IDAT dataset.

### 9.2 Prerequisites

1. **Stack must be running** before any test command is issued:

   ```bash
   docker compose up -d   # from the repo root
   ```

2. **Dataset for `@slow` tests** (optional — fast tests need none):

   By default the suite auto-discovers a complete IDAT set (`*.idat` files + a `SampleSheet*.csv`) under the host `jobs/` directory. To point at a specific folder:

   ```bash
   export E2E_DATASET_DIR=/absolute/path/to/idat_dataset
   ```

   If no dataset is found the upload-based tests **skip** gracefully instead of failing.

### 9.3 Local execution (Node.js 18+ on the host)

Install once:

```bash
cd e2e
npm ci
npx playwright install chromium
```

Run the fast suite (seconds, no R pipeline):

```bash
npm run test:fast
```

Run everything including the full R pipeline proof (10–20 min):

```bash
npm test
```

Run only the pipeline test:

```bash
npm run test:pipeline
```

Open the HTML report from the last run:

```bash
npm run report
```

Override the target base URL (default `https://localhost:8443`):

```bash
E2E_BASE_URL=https://localhost npm run test:fast
```

### 9.4 Docker execution (no local Node.js required)

Use the official Playwright Docker image that matches the pinned version (`v1.61.0`). The image bundles Node.js and all browser binaries.

**Linux** — attach to the host network so `localhost:8443` resolves to the running stack:

```bash
docker run --rm \
  --network host \
  -v "$PWD/e2e:/e2e" \
  -w /e2e \
  mcr.microsoft.com/playwright:v1.61.0-noble \
  sh -c "npm ci && npx playwright install chromium && npm run test:fast"
```

Full pipeline (`@slow`, requires `E2E_DATASET_DIR`):

```bash
docker run --rm \
  --network host \
  -e E2E_DATASET_DIR=/absolute/path/to/dataset \
  -v "$PWD/e2e:/e2e" \
  -v /absolute/path/to/dataset:/dataset:ro \
  -w /e2e \
  mcr.microsoft.com/playwright:v1.61.0-noble \
  sh -c "npm ci && npx playwright install chromium && npm test"
```

**macOS / Windows (Docker Desktop)** — Docker Desktop provides `host.docker.internal` to reach the host machine:

```powershell
docker run --rm `
  -e E2E_BASE_URL=https://host.docker.internal:8443 `
  -v "${PWD}/e2e:/e2e" `
  -w /e2e `
  mcr.microsoft.com/playwright:v1.61.0-noble `
  sh -c "npm ci && npx playwright install chromium && npm run test:fast"
```

> **Note:** The stack uses a self-signed development certificate (`certs/bigtom-local.pem`). The Playwright config sets `ignoreHTTPSErrors: true` globally, so certificate errors are suppressed automatically — no extra flags are needed.

### 9.5 Environment variables

| Variable | Default | Description |
|---|---|---|
| `E2E_BASE_URL` | `https://localhost:8443` | Base URL of the running stack (nginx). Override for production or CI. |
| `E2E_DATASET_DIR` | auto-discovered from `jobs/` | Absolute path to a folder containing IDAT files and a sample sheet. Required for `@slow` tests. |

### 9.6 Success criteria

- **Fast suite green** (`npm run test:fast`) — API contract, error handling, batch-variable validation, and the frontend shell all work correctly.
- **Full suite green** (`npm test`) — additionally, a real dataset flows through filtering, normalization, SVD, downstream DMR/DMP analysis, and produces populated result tables.

Success condition: Playwright exits with code `0` and all tests show ✓ in the list reporter.

## 10. Local Test Execution Without Docker

### Backend

PowerShell:

```powershell
cd backend
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:JOB_BASE_DIR = "..\jobs"
$env:JOB_RETENTION_HOURS = "24"
$env:JOB_CLEANUP_INTERVAL_SECONDS = "86400"
python -m pytest
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Bash:

```bash
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export JOB_BASE_DIR="../jobs"
export JOB_RETENTION_HOURS="24"
export JOB_CLEANUP_INTERVAL_SECONDS="86400"
python -m pytest
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Local backend workflow limitation: R execution still expects Docker access because `backend/app/services/r_executor/` builds `docker exec` commands for the `r_worker` container.

If Python 3.11 is not available locally, install it first or use the Docker backend. The backend image is based on Python `3.11-slim`; using a newer local interpreter can expose differences that are not part of the reproducible Docker environment.

### Frontend

```bash
cd frontend/app
npm ci
npm test -- --run
npm run lint
npm run build
npm run dev
```

The Vite dev server is started by `npm run dev`. The Docker frontend serves the compiled app through nginx: HTTP on `http://localhost:8080` (redirects to HTTPS) and HTTPS on `https://localhost:8443`.

### R Component

Local R execution is only supported if all script dependencies are installed locally. The repository does not provide an R package manifest. Prefer the Docker `r_worker` for reproducible R execution.

If local R is configured:

```bash
cd r_backend
Rscript -e "testthat::test_dir('tests')"
Rscript -e "testthat::test_file('tests/test_batch_svd.R')"
```

## 11. API Tests with cURL

Start the Docker environment first:

```bash
docker compose up -d --build
```

Root endpoint:

```bash
curl -i http://localhost:8000/
```

Expected status: `200 OK`. Expected fields: `message`, `version`.

OpenAPI JSON:

```bash
curl -i http://localhost:8000/openapi.json
```

Expected status: `200 OK`.

Swagger UI:

```bash
curl -i http://localhost:8000/docs
```

Expected status: `200 OK`.

The cURL examples below use Bash line continuations. In PowerShell, call `curl.exe` instead of the `curl` alias and replace `\` line continuations with backticks.

Upload (two-phase inspect/commit):

The current primary upload flow is a two-phase process. First, inspect the folder or ZIP to get a session and a sample-sheet preview:

```bash
curl -i -X POST http://localhost:8000/api/v1/upload/inspect \
  -F "archive=@/path/to/dataset.zip"
```

Expected status: `201 Created`. Expected fields: `session_id`, `candidates`, `idat_count`.

Preview and map columns before committing:

```bash
SESSION_ID="replace-with-session-id"
curl -i "http://localhost:8000/api/v1/upload/$SESSION_ID/preview"
```

Commit the selection with column mapping and filter settings:

```bash
curl -i -X POST http://localhost:8000/api/v1/upload/commit \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "'"$SESSION_ID"'",
    "candidate_index": 0,
    "column_mapping": {
      "sample_name": "Sample_Name",
      "sample_group": "Sample_Group",
      "sentrix_id": "Sentrix_ID",
      "sentrix_position": "Sentrix_Position"
    },
    "filter_settings": {
      "det_p": {"enabled": true, "cutoff": 0.01},
      "bead_count": {"enabled": false},
      "non_cpg": {"enabled": false},
      "snp": {"enabled": false},
      "multi_hit": {"enabled": false},
      "xy_chromosomes": {"enabled": false},
      "sample_quality": {"enabled": false}
    }
  }'
```

Expected status: `201 Created`. Expected fields: `job_id`, `status`, `filter_settings`.

Legacy single-shot upload (deprecated, still accepted but not the primary flow):

```bash
curl -i -X POST http://localhost:8000/api/v1/upload \
  -F "idat_files=@/path/to/sample_Grn.idat" \
  -F "idat_files=@/path/to/sample_Red.idat" \
  -F "sample_sheet=@/path/to/samplesheet.csv" \
  -F 'filter_settings={"filter_settings":{"det_p":{"enabled":true,"cutoff":0.01},"bead_count":{"enabled":false},"non_cpg":{"enabled":false},"snp":{"enabled":false},"multi_hit":{"enabled":false},"xy_chromosomes":{"enabled":false},"sample_quality":{"enabled":false}}}'
```

PowerShell equivalent (legacy):

```powershell
$FilterSettings = '{"filter_settings":{"det_p":{"enabled":true,"cutoff":0.01},"bead_count":{"enabled":false},"non_cpg":{"enabled":false},"snp":{"enabled":false},"multi_hit":{"enabled":false},"xy_chromosomes":{"enabled":false},"sample_quality":{"enabled":false}}}'

curl.exe -i -X POST "http://localhost:8000/api/v1/upload" `
  -F "idat_files=@C:/path/to/sample_Grn.idat" `
  -F "idat_files=@C:/path/to/sample_Red.idat" `
  -F "sample_sheet=@C:/path/to/samplesheet.csv" `
  -F "filter_settings=$FilterSettings"
```

Expected status: `201 Created`. Expected fields: `job_id`, `status`, `filter_settings`.

The `filter_settings` form field must be a JSON string with a top-level `filter_settings` key. Sending the inner object directly, for example `{"det_p":{"enabled":true}}`, returns `400` because the backend reads `parsed_filter["filter_settings"]`.

Job status:

```bash
JOB_ID="replace-with-real-job-id"

curl -i "http://localhost:8000/api/v1/status/$JOB_ID"
```

Expected status: `200 OK`. Expected fields: `job_id`, `status`, `phase`, `progress_percent`, `current_step`, `steps_total`, `steps_completed`.

Filtering statistics:

```bash
curl -i "http://localhost:8000/api/v1/filter/$JOB_ID/stats"
```

Expected status: `200 OK` after filtering data is available. Expected errors: `404` for unknown job, `410` for expired session, `409` while filtering is not finished.

Normalization preview metadata:

```bash
curl -i "http://localhost:8000/api/v1/preview/normalization/$JOB_ID"
```

Expected status: `200 OK` when preview plots are available. Expected fields: `job_id`, `plots`. The current route is `GET`; `POST` returns `405 Method Not Allowed`.

Normalization preview image:

```bash
curl -i "http://localhost:8000/api/v1/preview/normalization/$JOB_ID/density_noob.png"
```

Expected status: `200 OK` if the file exists. Only plot names starting with `density_` or `pca_` are accepted; other names return `400`.

Start normalization:

```bash
curl -i -X POST "http://localhost:8000/api/v1/normalize/$JOB_ID" \
  -H "Content-Type: application/json" \
  -d '{"method":"noob"}'
```

Allowed `method` values: `noob`, `quantile`, `swan`, `funnorm`, `raw`. Expected status: `202 Accepted`. Expected fields: `job_id`, `status`, `method`.

Cancel/reset:

```bash
curl -i -X POST "http://localhost:8000/api/v1/reset/$JOB_ID"
```

Expected status: `200 OK` for a cancelable job. Expected fields: `reset`, `status`. Expected errors: `404` for unknown job, `409` if the job is already `completed`, `canceled`, or `failed`.

Batch options:

```bash
curl -i "http://localhost:8000/api/v1/batch/$JOB_ID/batch-options"
```

Expected status: `200 OK`. Expected fields: `job_id`, `available_columns`.

Batch history:

```bash
curl -i "http://localhost:8000/api/v1/batch/$JOB_ID/history"
```

Expected status: `200 OK`. Expected fields: `job_id`, `rounds`, `current_round`, `correction_applied`.

Run batch correction:

```bash
curl -i -X POST "http://localhost:8000/api/v1/batch/$JOB_ID" \
  -H "Content-Type: application/json" \
  -d '{"batch_correction":{"batch_variable":"Sample_Group","covariates":[]}}'
```

Expected status: `202 Accepted`. Expected fields: `job_id`, `status`, `round`.

Skip batch correction and start downstream analysis:

```bash
curl -i -X POST "http://localhost:8000/api/v1/batch/$JOB_ID/skip"
```

Expected status: `202 Accepted`. Expected fields: `job_id`, `status`.

SVD plot:

```bash
curl -i "http://localhost:8000/api/v1/batch/$JOB_ID/svd-plot/0"
```

Expected status: `200 OK` if the plot exists.

Table data:

```bash
curl -i "http://localhost:8000/api/v1/table/$JOB_ID/dmp?page=1&sort_by=CHR&sort_order=asc"
```

Valid table names: `dmp`, `dmr`. Expected status: `200 OK` after analysis output exists. The backend page size is `75`.

Table export:

```bash
curl -i "http://localhost:8000/api/v1/table/$JOB_ID/dmp/export?sort_by=CHR&sort_order=asc"
```

Expected status: `200 OK` and `Content-Type: text/csv`.

Heatmap options:

```bash
curl -i "http://localhost:8000/api/v1/heatmap/$JOB_ID/options"
```

Expected status: `200 OK`. Expected fields: `job_id`, `available_columns`.

Run heatmap:

```bash
curl -i -X POST "http://localhost:8000/api/v1/heatmap/$JOB_ID" \
  -H "Content-Type: application/json" \
  -d '{"filters":{"chr":"chr19","adj_p_value":"0.05"},"grouping":{"primary":"Sample_Group"}}'
```

Expected status: `202 Accepted`. Expected fields: `job_id`, `phase`, `status`, `heatmap_metadata`.

The `filters` map uses the same keys as the DMP table query parameters (without the `filter_` prefix). Valid DMP filter keys: `chr`, `start`, `stop`, `gene`, `feature`, `cgi`, `adj_p_value`, `delta_beta`, `delta_direction`, `group1_avg_min`, `group1_avg_max`, `group2_avg_min`, `group2_avg_max`, `dmr_id`. An empty `filters` object runs the heatmap on all DMP rows visible in the table.

Download heatmap:

```bash
curl -i "http://localhost:8000/api/v1/heatmap/$JOB_ID"
```

Expected status: `200 OK` if `heatmap.png` exists.

## 12. Manual R Script Execution

List containers:

```bash
docker compose ps
```

Resolve the R worker container dynamically for direct `docker exec` commands:

```bash
JOB_ID="replace-with-real-job-id"
R_CONTAINER=$(docker compose ps -q r_worker)

docker exec "$R_CONTAINER" Rscript --version
```

PowerShell:

```powershell
$JobId = "replace-with-real-job-id"
$rContainer = docker compose ps -q r_worker

docker exec $rContainer Rscript --version
```

Run a real project script directly with `docker exec`:

```bash
JOB_ID="replace-with-real-job-id"
R_CONTAINER=$(docker compose ps -q r_worker)

docker exec "$R_CONTAINER" \
  Rscript /app/r_backend/normalize.R \
  "/app/jobs/$JOB_ID" \
  noob
```

PowerShell:

```powershell
$JobId = "replace-with-real-job-id"
$rContainer = docker compose ps -q r_worker

docker exec $rContainer `
  Rscript /app/r_backend/normalize.R `
  "/app/jobs/$JobId" `
  noob
```

Open a shell in the R worker (runs as `ruser`, not root — use `--user root` if system-level writes are needed):

```bash
docker compose exec r_worker bash
docker compose exec --user root r_worker bash
```

Host/container path mapping from `docker-compose.yml`:

| Host path | Container path |
|---|---|
| `./r_backend` | `/app/r_backend` |
| `./data` | `/app/data` |
| `./jobs` | `/app/jobs` |

Run existing scripts with confirmed paths:

```bash
JOB_ID="replace-with-real-job-id"

docker compose exec r_worker Rscript /app/r_backend/init_filter.R "/app/jobs/$JOB_ID/SampleSheet.csv" "/app/jobs/$JOB_ID"
docker compose exec r_worker Rscript /app/r_backend/normalization_preview.R "/app/jobs/$JOB_ID/filtered_data.rds" "/app/jobs/$JOB_ID" "/app/jobs/$JOB_ID/SampleSheet.csv"
docker compose exec r_worker Rscript /app/r_backend/normalize.R "/app/jobs/$JOB_ID" noob
docker compose exec r_worker Rscript /app/r_backend/batch_svd.R "/app/jobs/$JOB_ID/normalized_data.rds" "/app/jobs/$JOB_ID/SampleSheet.csv" "/app/jobs/$JOB_ID" svd_plot_0.png
docker compose exec r_worker Rscript /app/r_backend/batch_correct.R "/app/jobs/$JOB_ID" Sample_Group ""
docker compose exec r_worker Rscript /app/r_backend/dmp.R "/app/jobs/$JOB_ID/SampleSheet.csv" "/app/jobs/$JOB_ID" beta.rds 0.05 EPICv2
docker compose exec r_worker Rscript /app/r_backend/dmr.R "/app/jobs/$JOB_ID/SampleSheet.csv" "/app/jobs/$JOB_ID" beta.rds 3 NULL 0.05 1000 EPICv2 10 1
docker compose exec -e HEATMAP_GROUP1=Sample_Group -e HEATMAP_MAX_ROWS=500 -e HEATMAP_OUTPUT=heatmap.png r_worker Rscript /app/r_backend/heatmap.R "/app/jobs/$JOB_ID/dmp_results.rds" "/app/jobs/$JOB_ID/SampleSheet.csv" "/app/jobs/$JOB_ID"
```

Direct R script execution bypasses the FastAPI job-state workflow. Run these commands only on disposable test jobs or copied job directories because intermediate files such as `filtered_data.rds`, `normalized_data.rds`, `corrected_data.rds`, result CSV/RDS files, and plot files can be created or overwritten.

Inspect exit code in Bash:

```bash
echo $?
```

Inspect exit code in PowerShell after a local command:

```powershell
$LASTEXITCODE
```

The R worker container name (`swtp-ss26-bigtom-r_worker-1`) is pinned via `container_name` in `docker-compose.yml` and must match the constant `RCommand.R_WORKER_CONTAINER` in `backend/app/services/r_executor/commands/base.py`. Both are kept in sync by a regression test (`backend/tests/test_deploy_config.py`). Confirm the running container with `docker compose ps`.

## 13. Manual End-to-End Test

1. Start services.

```bash
docker compose up -d --build
```

Expected result: `frontend`, `backend`, and `r_worker` are running.

2. Open the frontend.

```text
https://localhost:8443
```

Expected result: the React SPA loads through nginx (self-signed certificate; accept the browser warning in a development environment).

3. Open the upload page.

```text
https://localhost:8443/upload
```

Expected result: the upload view shows the file dropzone and picker buttons.

4. Upload valid IDAT Green/Red pairs and a valid Sample Sheet.

Expected result: the frontend submits `idat_files`, `sample_sheet`, and `filter_settings` to `POST /api/v1/upload`; the backend returns a `job_id`.

For the remaining cURL commands, set the returned job ID first:

```bash
JOB_ID="replace-with-real-job-id"
```

5. Validate filtering progress.

```bash
curl -i "http://localhost:8000/api/v1/status/$JOB_ID"
```

Expected result: status progresses through filtering-related states or fails with an error visible in backend logs.

6. Inspect filtering statistics.

```bash
curl -i "http://localhost:8000/api/v1/filter/$JOB_ID/stats"
```

Expected result: statistics are returned after filtering completes; before completion the endpoint can return `409`.

7. Inspect normalization previews.

```bash
curl -i "http://localhost:8000/api/v1/preview/normalization/$JOB_ID"
```

Expected result: preview plot metadata is returned when available.

8. Select and start normalization.

```bash
curl -i -X POST "http://localhost:8000/api/v1/normalize/$JOB_ID" \
  -H "Content-Type: application/json" \
  -d '{"method":"noob"}'
```

Expected result: `202 Accepted`, followed by job status `ready_for_batch` when normalization and initial SVD generation finish.

9. Run or skip batch correction.

```bash
curl -i "http://localhost:8000/api/v1/batch/$JOB_ID/batch-options"
curl -i -X POST "http://localhost:8000/api/v1/batch/$JOB_ID/skip"
```

Expected result: skipping starts downstream analysis; running batch correction requires a valid Sample Sheet column for `batch_variable`.

10. Inspect downstream tables after analysis completes.

```bash
curl -i "http://localhost:8000/api/v1/table/$JOB_ID/dmp?page=1"
curl -i "http://localhost:8000/api/v1/table/$JOB_ID/dmr?page=1"
```

Expected result: table data is available after analysis output files exist; otherwise `409 DATA_NOT_READY`.

11. Test reset/cancel during a running job.

```bash
curl -i -X POST "http://localhost:8000/api/v1/reset/$JOB_ID"
```

Expected result: a cancelable job returns `{"reset":true,"status":"canceled"}`.

12. Inspect logs.

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 r_worker
```

Expected result: backend logs show route/R executor activity; R logs show script progress or package/data errors.

## 14. Negative and Failure Tests

| Case | Reproduction | Expected behavior |
|---|---|---|
| Unsupported IDAT type | Upload `fake.txt` as `idat_files` | `400`, invalid `.idat` format |
| Invalid IDAT content | Upload a tiny text file with `.idat` extension | `400`, invalid IDAT content |
| Missing or mismatched Green/Red pair | Frontend: upload `_Grn.idat` without matching `_Red.idat`, or mismatched prefixes. Backend API: upload an odd number of IDAT files. | Frontend reports the missing partner before submit; backend returns `400` for uneven file count |
| Missing Sample Sheet | Omit `sample_sheet` | FastAPI validation error, commonly `422` |
| Invalid Sample Sheet type | Upload `samples.pdf` as `sample_sheet` | `415`, invalid file format |
| Duplicate filenames | Upload duplicate IDAT filenames | `400`, duplicate filename |
| Backend unavailable | Stop backend and call API | Connection failure from curl/frontend |
| R worker unavailable | Stop `r_worker` during analysis | backend job eventually fails; inspect backend logs |
| Unknown job ID | `GET /api/v1/status/no-such-job` | `404` |
| Invalid workflow order | Request stats before filtering finishes | `409` |
| Upload limit violation | Exceed backend or nginx upload limits | backend `400` or proxy/request failure |
| Invalid normalization method | `{"method":"bad"}` with a real job ID | `400` (requires existing job — with an unknown job ID, the route returns `404` before validating the method) |
| Invalid table name | `/api/v1/table/{job_id}/bad` with a real job ID | `400` (requires existing job — with an unknown job ID, the job-not-found check runs first and returns `404`) |
| Unknown table filter | Request a ready table with an unsupported `filter_*` key, for example `?filter_banana=123` | `400` after the table data file is loaded |
| Invalid plot name | `/api/v1/preview/normalization/{job_id}/bad.png` | `400` |

## 15. Logging and Debugging

All logs:

```bash
docker compose logs
```

Live logs:

```bash
docker compose logs -f
```

Recent log lines:

```bash
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 r_worker
```

Container status:

```bash
docker compose ps
docker ps
```

Inspect a service container:

```bash
BACKEND_CONTAINER=$(docker compose ps -q backend)
docker inspect "$BACKEND_CONTAINER"
```

PowerShell:

```powershell
$backendContainer = docker compose ps -q backend
docker inspect $backendContainer
```

Search logs on Linux/macOS:

```bash
docker compose logs backend | grep -i error
docker compose logs r_worker | grep -i "there is no package"
```

Search logs with PowerShell:

```powershell
docker compose logs backend | Select-String -Pattern "error" -CaseSensitive:$false
docker compose logs r_worker | Select-String -Pattern "there is no package" -CaseSensitive:$false
```

Common failure categories:

- Missing environment variables: check `.env.example` and `docker-compose.yml`.
- Unavailable service: run `docker compose ps` and inspect service logs.
- Port conflict: the stack uses host ports `8080` (nginx HTTP), `8443` (nginx HTTPS), and `8000` (backend). In production deployments ports `80` and `443` are used instead. Free any conflicting processes before starting the stack.
- Missing Python dependency: rebuild backend or run `pip install -r backend/requirements.txt`.
- Missing R/Bioconductor package: rebuild `r_worker`; the R build can take a long time.
- Permission issue: check bind mounts for `./jobs`, `./r_backend`, and Docker socket access. If backend tests fail with `PermissionError: /app/jobs/<uuid>`, you ran pytest with `--user root`; remove that flag (see Section 6).
- Invalid mounted path: compare host paths with container paths in `docker-compose.yml`.
- Invalid Sample Sheet: verify extension, CSV delimiter, and `[Data]` section if using Illumina-style files.
- Incomplete IDAT pair: ensure matching `_Grn.idat` and `_Red.idat` filenames.
- Stuck or failed job: poll `/api/v1/status/{job_id}` and inspect backend plus R worker logs.
- Frontend API configuration problem: Docker nginx proxies `/api/` to `http://backend:8000`; some frontend batch code also calls `http://localhost:8000/api/v1` directly.

## 16. Expected Test Results

| Component | Command | Success condition / notes |
|---|---|---|
| Docker Compose config | `docker compose config --services` | Lists `backend`, `frontend`, and `r_worker`; can be checked without starting containers |
| Backend | `docker compose exec backend python -m pytest tests/ -v` | Exit code `0`, `314 passed, 1 skipped`; run without `--user root` (see Section 6). The 1 skip is `test_deploy_config.py` (docker-compose.yml not in container) |
| Frontend tests | `npm test -- --run` from `frontend/app` | Exit code `0` when the Vitest suite passes |
| Frontend tests in temporary Node container | `docker run --rm -v "$PWD/frontend/app:/app" -v /app/node_modules -w /app node:20-alpine sh -c "npm ci && npm test -- --run"` | Exit code `0` when dependencies install and Vitest passes; separate from the nginx runtime service |
| Frontend lint | `npm run lint` from `frontend/app` | Exit code `0` when ESLint passes |
| Frontend build | `npm run build` from `frontend/app` | Creates `dist/` and exits with code `0` |
| R tests | `docker compose exec r_worker Rscript -e "setwd('/app/r_backend'); testthat::test_dir('tests')"` | Exit code `0` when R dependencies and required test data are present. `testthat` is installed in the image; if missing, rebuild with `docker compose build r_worker` |
| E2E fast suite | `npm run test:fast` from `e2e/` (stack must be up) | Exit code `0`, 15 tests pass; covers API contract, error handling, batch validation, and frontend smoke |
| E2E fast suite (Docker) | `docker run --rm --network host -v "$PWD/e2e:/e2e" -w /e2e mcr.microsoft.com/playwright:v1.61.0-noble sh -c "npm ci && npx playwright install chromium && npm run test:fast"` | Same as above; no local Node.js required |
| E2E full suite | `npm test` from `e2e/` with `E2E_DATASET_DIR` set | Exit code `0` after full pipeline proof; requires a real IDAT dataset and 10–20 min |
| API root | `curl -ik https://localhost:8443/` | `200 OK` HTML; requires a running frontend container |
| Backend health | `curl -i http://localhost:8000/health` | `200 OK` with `{"status": "ok"}` |

This table defines success conditions. It does not claim that every test command currently passes in the repository; record exact current results in the Merge Request or ticket.

## 17. Troubleshooting

Docker daemon is unavailable:

```bash
docker compose ps
```

If this fails, start Docker Desktop or the local Docker daemon before running Docker-based tests.

Backend tests fail because test data is missing:

- Check `backend/tests/conftest.py` references to `backend/tests/data/...`.
- Some integration tests require prepared job directories under `jobs/` or `/app/jobs/`.
- Provide valid non-private test data or mark data-dependent tests accordingly.

R tests fail with hard-coded `/app/jobs/...` paths:

- Mount or create the expected job directory under host `./jobs`.
- Prefer Docker execution so `/app/jobs`, `/app/r_backend`, and package paths match the scripts.

Normalization preview tests expect `POST`, but the current backend exposes only `GET`:

- Confirm route behavior with `python -c "import sys; sys.path.insert(0,'.'); from app.main import app; print([r.path for r in app.routes])"` from `backend`.
- Update tests or implementation in a separate code ticket; do not change it as part of this documentation task.

Frontend tests or lint fail:

- Run the exact command again with one file to isolate the failure.
- Use `npm run build` separately to distinguish TypeScript/build failures from test or lint failures.
- Do not mark the frontend checks as passed unless Vitest and ESLint exit with code `0`.

Frontend npm command fails in the running service:

Symptom:

```text
exec: "npm": executable file not found in $PATH
```

Cause: the running `frontend` service is the nginx production stage from `frontend/Dockerfile` and does not contain Node.js or npm.

Solution: run frontend commands locally from `frontend/app`, or use the temporary `node:20-alpine` container documented in Section 7.

A declared R package is missing after a stale or broken build:

```bash
docker compose build --no-cache r_worker
```

If `testthat` is missing, it must be added to `r_backend/Dockerfile` and the image rebuilt. Runtime installation via `install.packages` is not viable: the r_worker runs on an isolated internal network (no internet access at runtime) and as a non-root user (no write access to the system library without `--user root`). Even with `--user root`, the container cannot reach CRAN.

```bash
# Ensure 'testthat' is in r_backend/Dockerfile, then rebuild:
docker compose build r_worker
docker compose up -d r_worker
```

Port already in use:

```bash
docker compose down
```

Then restart:

```bash
docker compose up -d
```

## 18. Test Completion Checklist

- [ ] `docker compose config --services` lists `backend`, `frontend`, and `r_worker`.
- [ ] Docker services start with `docker compose up -d --build`.
- [ ] Backend tests were run with Pytest and failures were documented or fixed.
- [ ] Frontend Vitest tests were run from `frontend/app` with `npm test -- --run`, or through the documented temporary `node:20-alpine` container.
- [ ] Frontend lint was run from `frontend/app` with `npm run lint`.
- [ ] Frontend build was run from `frontend/app` with `npm run build`.
- [ ] R tests were run in `r_worker`, or missing R dependencies/test data were documented.
- [ ] E2E fast suite passes: `npm run test:fast` from `e2e/` exits with code `0` (15 tests green).
- [ ] E2E full suite was run with a real IDAT dataset, or the skip reason was documented.
- [ ] API root, OpenAPI, upload, status, stats, normalization, batch, table, reset, and heatmap endpoints were checked as applicable.
- [ ] Manual end-to-end workflow was tested with valid IDAT pairs and a valid Sample Sheet.
- [ ] Negative upload and invalid job-ID cases were tested.
- [ ] Backend and R worker logs were inspected for errors.
- [ ] No private IDAT or Sample Sheet data was committed.
