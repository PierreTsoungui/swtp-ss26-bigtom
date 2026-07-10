import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration for the MethylAnalyzer stack.
 *
 * Tests run against the *running* docker-compose stack. The nginx container
 * serves the frontend (SPA) and proxies /api/ to the FastAPI backend.
 *
 * Default ports (docker-compose dev mapping):
 *   - https://localhost:8443  → nginx (HTTPS, self-signed cert)
 *   - http://localhost:8080   → nginx HTTP redirect to HTTPS
 *   - http://localhost:8000   → backend (direct, used only for debugging)
 *
 * In production the stack binds to ports 80/443 instead. Override with:
 *   E2E_BASE_URL=https://localhost npm test
 *
 * ignoreHTTPSErrors is required because the stack uses a self-signed
 * development certificate (certs/bigtom-local.pem).
 *
 * The R pipeline steps take several minutes, so the suite runs single-threaded
 * (workers: 1) to avoid overloading the single-threaded R worker. Long-running
 * pipeline tests raise their own per-test timeout and are tagged @slow:
 *   - fast only:  npm run test:fast
 *   - everything: npm test
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "https://localhost:8443",
    // The stack uses a self-signed development certificate.
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
