import { describe, it, expect } from "vitest";
import { readApiError } from "./apiError";

/** Builds a minimal fetch Response for testing. */
function makeResponse(status: number, body: string, contentType?: string): Response {
  return new Response(body, {
    status,
    headers: contentType ? { "Content-Type": contentType } : undefined,
  });
}

describe("readApiError", () => {
  it("surfaces the detail of an RFC 9457 problem+json body", async () => {
    const res = makeResponse(
      410,
      JSON.stringify({ type: "/errors/session-expired", title: "Session expired", detail: "Please re-run the analysis." }),
      "application/problem+json",
    );
    expect(await readApiError(res, "Heatmap generation failed")).toBe("Please re-run the analysis.");
  });

  it("falls back to title when detail is missing", async () => {
    const res = makeResponse(409, JSON.stringify({ title: "Conflict" }), "application/json");
    expect(await readApiError(res, "fallback")).toBe("Conflict");
  });

  it("never throws on a non-JSON body and returns a clean status fallback", async () => {
    // This is the exact case that previously produced
    // "JSON.parse: unexpected character at line 1 column 1".
    const res = makeResponse(500, "Internal Server Error", "text/plain");
    const msg = await readApiError(res, "Heatmap generation failed");
    expect(msg).toBe("Heatmap generation failed (HTTP 500).");
  });

  it("uses a friendly message for a 410 with an empty body", async () => {
    const res = makeResponse(410, "");
    expect(await readApiError(res, "fallback")).toContain("session is no longer available");
  });
});
