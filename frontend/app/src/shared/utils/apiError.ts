/**
 * Robust extraction of a human-readable message from a failed API response.
 *
 * The backend signals errors with an RFC 9457 "problem+json" body
 * (`{ type, title, status, detail, ... }`). However, an unexpected server fault
 * can still produce a non-JSON body (e.g. a plain "Internal Server Error").
 * Calling `response.json()` on such a body throws the opaque
 * "JSON.parse: unexpected character at line 1 column 1" — which is exactly the
 * error users must never see. This helper reads the body defensively and always
 * returns a clean message, never throwing.
 *
 * Security note: only the structured `detail`/`title` of a problem+json body is
 * surfaced. Arbitrary non-JSON server text is deliberately not echoed to the
 * user; a status-based fallback is shown instead so internal details never leak.
 */

/** Minimal shape of an RFC 9457 problem+json error body. */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
}

/** Friendly fallbacks for the status codes this app deliberately returns. */
const STATUS_FALLBACKS: Record<number, string> = {
  410: "This analysis session is no longer available. It may have expired or the server was restarted — please re-run the analysis.",
  404: "The requested resource could not be found.",
  409: "This action conflicts with the current state of the job.",
};

/**
 * Reads a *failed* `Response` (caller has already checked `!response.ok`) and
 * returns a user-facing message.
 *
 * @param response The non-OK fetch Response.
 * @param fallback Context-specific fallback (e.g. "Heatmap generation failed").
 */
export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const raw = await response.text();
    if (raw) {
      try {
        const body = JSON.parse(raw) as ProblemDetail;
        const message = body.detail?.trim() || body.title?.trim();
        if (message) return message;
      } catch {
        // Body was not JSON — fall through to the status-based fallback below
        // rather than surfacing raw server output.
      }
    }
  } catch {
    // Body could not be read (e.g. network error) — use the fallback.
  }

  return STATUS_FALLBACKS[response.status] ?? `${fallback} (HTTP ${response.status}).`;
}
