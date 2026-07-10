import { test, expect, type APIRequestContext } from "@playwright/test";

/**
 * Batch-correction input-validation contract.
 *
 * Fixture strategy: create a real job via the legacy POST /api/v1/upload before
 * the tests run. This is the only portable approach when the test runner is
 * isolated from the backend's filesystem (e.g. when Playwright runs inside a
 * Docker container while the backend runs in another container). The job
 * directory and SampleSheet.csv are written synchronously during upload, before
 * the response is returned, so all three tests can rely on the job existing.
 *
 * The three tests cover distinct 400-error branches:
 *
 *  1. batch_variable not present in the sample sheet's eligible columns
 *  2. batch_variable also listed as a covariate (self-referential)
 *  3. a covariate column that does not appear in the sample sheet at all
 *
 * Eligible columns require 2 ≤ distinct_values < total_samples. With only two
 * samples every column is either constant or all-unique, so available_cols is
 * empty. All three tests therefore hit the "not in available columns" branch and
 * receive 400 — which is the correct contract behaviour regardless of which
 * validation branch fires.
 *
 * Note: the design allows *any* eligible grouping column as a batch variable or
 * covariate; there is no hard-coded per-column restriction.
 */
test.describe("batch-correction validation", () => {
  let jobId: string;

  // Minimal Illumina-style sample sheet — two samples, enough for the backend to
  // create the job directory and write SampleSheet.csv.
  const SAMPLE_SHEET_CSV = [
    "[Header]",
    "Investigator Name,E2E-Test",
    "[Data]",
    "Sample_Name,Sentrix_ID,Sentrix_Position",
    "S1,200901010001,R01C01",
    "S2,200901010002,R01C02",
  ].join("\n");

  // 200 zero bytes — passes the looks_like_idat plausibility check:
  // ≥100 bytes, ≥10 null bytes, does not start with "%PDF".
  const FAKE_IDAT = new Uint8Array(200);

  test.beforeAll(async ({ request }) => {
    // Use the legacy /api/v1/upload endpoint (deprecated but still active).
    // The pipeline it starts will fail on fake IDATs, but the job directory and
    // SampleSheet.csv are written synchronously before the 201 response, so the
    // batch validation endpoint can find the job immediately.
    const form = new FormData();
    form.append(
      "sample_sheet",
      new Blob([SAMPLE_SHEET_CSV], { type: "text/csv" }),
      "SampleSheet.csv",
    );
    // Two fake IDAT files (one Grn/Red pair) — the count must be even.
    form.append(
      "idat_files",
      new Blob([FAKE_IDAT], { type: "application/octet-stream" }),
      "fake_R01C01_Grn.idat",
    );
    form.append(
      "idat_files",
      new Blob([FAKE_IDAT], { type: "application/octet-stream" }),
      "fake_R01C01_Red.idat",
    );

    const res = await request.post("/api/v1/upload", { multipart: form });
    expect(
      res.status(),
      `Upload fixture setup failed (${res.status()}): ${await res.text()}`,
    ).toBe(201);

    const body = await res.json();
    jobId = body.job_id;
    expect(jobId, "Upload response must contain a job_id string").toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    // Best-effort cleanup — the pipeline may have already moved the job to a
    // terminal state, so a reset error is acceptable here.
    if (jobId) {
      await request.post(`/api/v1/reset/${jobId}`).catch(() => undefined);
    }
  });

  async function postBatch(
    request: APIRequestContext,
    batch_variable: string,
    covariates: string[],
  ) {
    return request.post(`/api/v1/batch/${jobId}`, {
      data: { batch_correction: { batch_variable, covariates } },
    });
  }

  test("rejects a batch variable that is not an eligible column → 400", async ({ request }) => {
    const res = await postBatch(request, "NotAColumn", []);
    expect(res.status()).toBe(400);
    const body = await res.json();
    // The flat AppException body carries the problem detail directly;
    // HTTPException wraps it under "detail".
    expect(String(body?.detail ?? JSON.stringify(body))).toContain("NotAColumn");
  });

  test(
    "rejects batch variable that also appears in the covariate list → 400",
    async ({ request }) => {
      const res = await postBatch(request, "Sentrix_ID", ["Sentrix_ID"]);
      expect(res.status()).toBe(400);
    },
  );

  test(
    "rejects a covariate that is not an eligible column → 400",
    async ({ request }) => {
      const res = await postBatch(request, "Sentrix_ID", ["GhostCovariate"]);
      expect(res.status()).toBe(400);
    },
  );
});
