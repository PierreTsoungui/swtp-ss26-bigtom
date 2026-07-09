# E2E Tests (Playwright)

End-to-end tests for the MethylAnalyzer stack. They run against the **running
docker-compose stack** and prove the system works end-to-end — from the HTTP
API contract, through the real R pipeline, to the result tables — plus a
frontend smoke test.

## Layout

```
e2e/
├── playwright.config.ts
└── tests/
    ├── fixtures/        # dataset discovery + API helpers
    ├── api/             # API-driven E2E (the backbone proof)
    │   ├── health.spec.ts            # reachability + RFC 9457 contract
    │   ├── errors.spec.ts            # 404/400 error contract
    │   ├── batch-validation.spec.ts  # batch-variable guards (fast, synthetic job)
    │   ├── reset.spec.ts             # real cancellation  (@slow)
    │   └── pipeline.spec.ts          # full upload→…→results (@slow)
    └── ui/
        └── smoke.spec.ts             # frontend renders + navigation
```

`@slow` tests upload the full IDAT dataset and wait for the R pipeline
(several minutes per step).

## Prerequisites

1. **Stack must be running:**

   ```bash
   docker compose up -d   # from the repo root
   ```

   The frontend is served by nginx at `https://localhost:8443` (HTTPS,
   self-signed dev certificate). The backend is at `http://localhost:8000`.

2. **Dataset for `@slow` tests** (optional — fast tests need none):

   By default the suite auto-discovers a complete IDAT set (`*.idat` files +
   a `SampleSheet*.csv`) under the host `jobs/` directory. To point at a
   specific folder:

   ```bash
   export E2E_DATASET_DIR=/absolute/path/to/idat_dataset
   ```

   If no dataset is found the upload-based tests **skip** gracefully instead
   of failing.

## Local execution (Node.js 18+ on the host)

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

Run everything, including the full pipeline proof (10–20 min with real data):

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

## Docker execution (no local Node.js required)

Use the official Playwright image that matches the pinned version (`v1.61.0`).
The image bundles Node.js and all browser binaries.

**Linux** — `--network host` lets the container reach `localhost:8443`:

```bash
docker run --rm \
  --network host \
  -v "$PWD/e2e:/e2e" \
  -w /e2e \
  mcr.microsoft.com/playwright:v1.61.0-noble \
  sh -c "npm ci && npx playwright install chromium && npm run test:fast"
```

Full suite with a dataset mounted read-only:

```bash
docker run --rm \
  --network host \
  -e E2E_DATASET_DIR=/dataset \
  -v "$PWD/e2e:/e2e" \
  -v /absolute/path/to/dataset:/dataset:ro \
  -w /e2e \
  mcr.microsoft.com/playwright:v1.61.0-noble \
  sh -c "npm ci && npx playwright install chromium && npm test"
```

**macOS / Windows (Docker Desktop)** — use `host.docker.internal` to reach the
host machine:

```powershell
docker run --rm `
  -e E2E_BASE_URL=https://host.docker.internal:8443 `
  -v "${PWD}/e2e:/e2e" `
  -w /e2e `
  mcr.microsoft.com/playwright:v1.61.0-noble `
  sh -c "npm ci && npx playwright install chromium && npm run test:fast"
```

> The Playwright config sets `ignoreHTTPSErrors: true` globally, so the
> self-signed development certificate is accepted automatically.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `E2E_BASE_URL` | `https://localhost:8443` | Base URL of the running stack. Override for production or CI. |
| `E2E_DATASET_DIR` | auto-discovered from `jobs/` | Absolute path to a folder with IDAT files and a sample sheet. Required for `@slow` tests. |

## What "green" means

- **Fast suite green** (`npm run test:fast`) — API contract, error handling,
  batch-variable validation, and the frontend shell all work correctly.
- **Full suite green** (`npm test`) — additionally, a real dataset flows through
  filtering, normalization, SVD, downstream DMR/DMP analysis, and produces
  populated result tables — the whole program works.
