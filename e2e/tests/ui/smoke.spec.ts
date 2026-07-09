import { test, expect } from "@playwright/test";

/**
 * Frontend smoke tests: the SPA renders, navigation works, and the key pages
 * mount their expected controls. Kept deliberately shallow — deep flows are
 * covered by the API pipeline test.
 */
test.describe("UI smoke", () => {
  test("landing page renders and links to upload", async ({ page }) => {
    await page.goto("/");
    // Brand name is in the AppHeader.
    await expect(page.getByText("MethylAnalyzer").first()).toBeVisible();
    // Primary CTA on the HeroSection routes to /upload.
    await expect(page.getByRole("link", { name: /start analysis/i })).toBeVisible();
  });

  test("navigating to upload shows the dropzone controls", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /start analysis/i }).click();
    await expect(page).toHaveURL(/\/upload$/);

    // In the initial (idle) state the dropzone renders two picker buttons.
    await expect(page.getByRole("button", { name: "Select files / ZIP" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Select folder" })).toBeVisible();

    // The commit button is only rendered after the user has selected files and
    // completed the review step; it must be absent from the DOM here.
    await expect(page.getByRole("button", { name: "Start analysis" })).not.toBeAttached();
  });

  test("upload page has hidden file inputs with correct accept attributes", async ({ page }) => {
    await page.goto("/upload");

    // File / ZIP picker: accepts the full list of supported file types.
    await expect(
      page.locator('input[type="file"][accept=".zip,.idat,.csv,.xls,.xlsx"]').first(),
    ).toBeAttached();

    // Folder picker: uses the non-standard webkitdirectory attribute and has no
    // accept filter (the backend classifies files from folder uploads itself).
    await expect(page.locator("input[type='file'][webkitdirectory]")).toBeAttached();
  });

  test("privacy policy page renders at /privacy", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  });

  test("unknown route renders the not-found fallback", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});
