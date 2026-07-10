import { test, expect } from "@playwright/test";
import { findDataset } from "../fixtures/dataset";
import { uploadDataset, waitForStatus, reachedPhase } from "../fixtures/api";

/**
 * The full end-to-end proof: drive a real dataset through the entire pipeline
 * via the public API and assert every phase transition and the final results.
 *
 * Upload → Filtering → Normalization preview → Normalization → SVD →
 * (skip batch) → DMR + DMP analysis → Results tables → Heatmap options.
 *
 * Tagged @slow: the R steps take several minutes each. Run with `npm test`
 * (or `npm run test:pipeline`); the fast suite excludes it.
 */
test.describe.serial("full pipeline @slow", () => {
  const ds = findDataset();
  let jobId: string;

  test.beforeAll(() => {
    test.skip(!ds, "No IDAT dataset available (set E2E_DATASET_DIR).");
  });

  test("upload starts the job", async ({ request }) => {
    test.setTimeout(360_000); // the upload itself can be large
    const res = await uploadDataset(request, ds!);
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.job_id).toBeTruthy();
    jobId = body.job_id;
  });

  test("filtering + normalization preview complete", async ({ request }) => {
    test.setTimeout(720_000);
    const s = await waitForStatus(request, jobId, reachedPhase("normalization", "waiting"), {
      timeoutMs: 700_000,
      label: "normalization/waiting (filtering + preview done)",
    });
    expect(s.phase).toBe("normalization");
    expect(s.status).toBe("waiting");

    // Preview plots are available.
    const preview = await request.get(`/api/v1/preview/normalization/${jobId}`);
    expect(preview.ok()).toBeTruthy();
  });

  test("normalization + SVD complete → batch stage", async ({ request }) => {
    test.setTimeout(720_000);
    const start = await request.post(`/api/v1/normalize/${jobId}`, {
      data: { method: "noob" },
    });
    expect(start.status()).toBe(202);

    const s = await waitForStatus(request, jobId, reachedPhase("batch", "waiting"), {
      timeoutMs: 700_000,
      label: "batch/waiting (normalization + SVD done)",
    });
    expect(s.phase).toBe("batch");
  });

  test("batch options expose the sample-sheet grouping columns", async ({ request }) => {
    const res = await request.get(`/api/v1/batch/${jobId}/batch-options`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.available_columns)).toBeTruthy();
    expect(body.available_columns.length).toBeGreaterThan(0);
    // Sample_Group must always be eligible (multiple groups, not one per sample).
    expect(body.available_columns).toContain("Sample_Group");
    // Sentrix_Position is intentionally excluded: with one unique position per
    // sample it has as many distinct values as there are rows, so it cannot
    // group samples and is correctly filtered out by get_eligible_columns.
  });

  test("skip batch → downstream analysis completes with results", async ({ request }) => {
    test.setTimeout(720_000);
    const skip = await request.post(`/api/v1/batch/${jobId}/skip`);
    expect(skip.status()).toBe(202);

    const s = await waitForStatus(request, jobId, reachedPhase("results", "waiting"), {
      timeoutMs: 700_000,
      label: "results/waiting (DMR + DMP done)",
    });
    expect(s.phase).toBe("results");
  });

  test("DMP and DMR result tables are populated", async ({ request }) => {
    for (const table of ["dmp", "dmr"] as const) {
      const res = await request.get(`/api/v1/table/${jobId}/${table}`);
      expect(res.ok(), `${table} table should load`).toBeTruthy();
      const body = await res.json();
      expect(Array.isArray(body.columns)).toBeTruthy();
      expect(body.columns.length).toBeGreaterThan(0);
      expect(typeof body.pagination.total_rows).toBe("number");
      // Uncorrected analysis on the demo data yields significant hits.
      expect(body.pagination.total_rows, `${table} should have rows`).toBeGreaterThan(0);
      expect(Array.isArray(body.data)).toBeTruthy();
    }
  });

  test("heatmap options are available for the completed job", async ({ request }) => {
    const res = await request.get(`/api/v1/heatmap/${jobId}/options`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body.available_columns)).toBeTruthy();
  });
});
