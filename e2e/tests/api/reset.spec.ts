import { test, expect } from "@playwright/test";
import { findDataset } from "../fixtures/dataset";
import { uploadDataset } from "../fixtures/api";

/**
 * Real cooperative cancellation: upload a job (which starts the filtering
 * pipeline), then reset it. The job must be cancelled and fully deleted.
 * Tagged @slow because it uploads the full dataset.
 */
test.describe("reset / cancellation @slow", () => {
  const ds = findDataset();

  test("upload then reset deletes the running job", async ({ request }) => {
    test.skip(!ds, "No IDAT dataset available (set E2E_DATASET_DIR).");
    test.setTimeout(180_000);

    const up = await uploadDataset(request, ds!);
    expect(up.status()).toBe(201);
    const { job_id } = await up.json();

    // The pipeline is now running in the background. Reset it.
    const reset = await request.post(`/api/v1/reset/${job_id}`);
    expect(reset.status()).toBe(200);
    expect(await reset.json()).toMatchObject({ reset: true });

    // The job is gone: status now 404.
    const status = await request.get(`/api/v1/status/${job_id}`);
    expect(status.status()).toBe(404);
  });
});
