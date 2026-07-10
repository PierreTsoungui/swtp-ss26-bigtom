import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectProblemDetail } from "../fixtures/api";

/**
 * API error contract for unknown jobs and invalid input. These are fast,
 * deterministic, and need no running pipeline.
 */
test.describe("error contract", () => {
  test("status of an unknown job → 404", async ({ request }) => {
    const res = await request.get(`/api/v1/status/${randomUUID()}`);
    expect(res.status()).toBe(404);
    expectProblemDetail(await res.json(), 404);
  });

  test("reset of an unknown job → 404", async ({ request }) => {
    const res = await request.post(`/api/v1/reset/${randomUUID()}`);
    expect(res.status()).toBe(404);
    expectProblemDetail(await res.json(), 404);
  });

  test("normalize of an unknown job → 404", async ({ request }) => {
    const res = await request.post(`/api/v1/normalize/${randomUUID()}`, {
      data: { method: "noob" },
    });
    expect(res.status()).toBe(404);
    expectProblemDetail(await res.json(), 404);
  });

  test("result table of an unknown job → 404", async ({ request }) => {
    const res = await request.get(`/api/v1/table/${randomUUID()}/dmp`);
    expect(res.status()).toBe(404);
  });

  test("upload with invalid IDAT content → 400 problem detail", async ({ request }) => {
    const form = new FormData();
    form.append(
      "sample_sheet",
      new Blob(["[Header]\n[Data]\nSample_Name\nX\n"]),
      "SampleSheet.csv",
    );
    form.append("idat_files", new Blob(["nope"]), "fake_R01C01_Grn.idat");
    form.append("idat_files", new Blob(["nope"]), "fake_R01C01_Red.idat");

    const res = await request.post("/api/v1/upload", { multipart: form });
    expect(res.status()).toBe(400);
    expectProblemDetail(await res.json(), 400);
  });
});
