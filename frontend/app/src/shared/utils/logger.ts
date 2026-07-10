/**
 * Minimal application logger — the single, intentional seam for diagnostic output.
 *
 * Centralizing logging here (instead of scattering `console.*` calls across the
 * codebase) means the destination can change in exactly one place later — for
 * example forwarding warnings and errors to an error-reporting service in
 * production — without touching any call site. For now it delegates to the
 * browser console.
 *
 * This module is the *only* place in the application that should call `console`
 * directly; everywhere else logs through {@link logger}.
 */

/** Extra structured context passed alongside a log message. */
type LogContext = readonly unknown[];

/**
 * The application-wide logger. Use {@link logger.warn} for recoverable
 * anomalies (e.g. a retried request) and {@link logger.error} for genuine
 * failures the developer needs to see.
 */
export const logger = {
  /**
   * Logs a recoverable anomaly.
   * @param message - Human-readable summary.
   * @param context - Optional structured details (error objects, ids, …).
   */
  warn(message: string, ...context: LogContext): void {
    // eslint-disable-next-line no-console -- the single sanctioned console sink
    console.warn(message, ...context);
  },

  /**
   * Logs a genuine failure.
   * @param message - Human-readable summary.
   * @param context - Optional structured details (error objects, ids, …).
   */
  error(message: string, ...context: LogContext): void {
    // eslint-disable-next-line no-console -- the single sanctioned console sink
    console.error(message, ...context);
  },
};
