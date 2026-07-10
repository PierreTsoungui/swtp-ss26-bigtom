import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectProblemDetail } from "../fixtures/api";

/**
 * Basic reachability + API contract. Proves the frontend serves the SPA and the
 * backend is reachable through the nginx /api proxy and speaks RFC 9457.
 */
test.describe("health", () => {
  test("frontend serves the SPA", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    await expect(page.locator("#root")).toBeAttached();
  });

  test("backend is reachable through the /api proxy", async ({ request }) => {
    const res = await request.get(`/api/v1/status/${randomUUID()}`);
    expect(res.status()).toBe(404);
    expectProblemDetail(await res.json(), 404);
  });
});
