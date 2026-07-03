# r_backend/utils/progress.R
#
# The progress / status protocol shared by every R analysis script.
#
# Each R script is launched by the Python backend and streamed line by line
# (see backend .../r_executor/executor.py and protocol.py). Communication is
# one-way, R -> backend, over stdout: every event is a SINGLE line of JSON that
# the backend parses to drive the job's live progress bar and final state.
#
# Three event types form the contract:
#   {"type":"progress","percent":<int 0-100>,"message":<string>}  step update
#   {"type":"error","message":<string>}                           fatal, exits 1
#   {"type":"done", ...arbitrary named fields...}                 success payload
#
# CONVENTIONS
#   - One JSON object per line (never pretty-printed / multi-line): the backend
#     reads the stream line-wise, so an embedded newline would split one event.
#   - stdout is the data channel. Human-readable package banners / warnings go to
#     stderr and are treated as noise by the backend — never emit protocol JSON
#     on stderr.
#   - Scalars are unboxed (auto_unbox = TRUE) so `percent`/`message` are plain
#     JSON values, not length-1 arrays.
#   - flush.console() forces the line out immediately, so progress is live even
#     when R's output would otherwise be buffered.
#
# DEPENDENCIES
#   - jsonlite (for toJSON). Source this file before any util that reports fatal
#     errors, because emit_error() is the shared failure path (e.g.
#     utils/arraytype.R, utils/beta.R call it).

#' Emit a progress event.
#'
#' Writes a single \code{{"type":"progress",...}} JSON line to stdout for the
#' backend to update the job's progress bar. Purely a side effect on stdout.
#'
#' @param percent Progress of the current step, coerced to an integer in
#'   \code{[0, 100]}. Callers are expected to pass monotonically increasing
#'   values across a script.
#' @param message Short human-readable description of the current step.
#' @return Invisibly \code{NULL}; called for its stdout side effect.
#' @examples
#' \dontrun{
#' emit_progress(0, "Initializing workflow")
#' emit_progress(75, "Running statistical test")
#' }
emit_progress <- function(percent, message) {
  cat(jsonlite::toJSON(
    list(
      type    = "progress",
      percent = as.integer(percent),
      message = as.character(message)
    ),
    auto_unbox = TRUE
  ), "\n")
  flush.console()
}

#' Emit a fatal error and terminate the script.
#'
#' Writes a single \code{{"type":"error","message":...}} JSON line to stdout and
#' then stops R with a non-zero exit status. This is the canonical failure path
#' for the whole pipeline: the backend captures the message and surfaces it to
#' the user, and the non-zero status marks the job as failed.
#'
#' @param message Human-readable error description.
#' @return Does not return — it calls \code{quit()} and never yields control back
#'   to the caller.
#' @details \code{quit(save = "no", status = 1)} exits immediately without saving
#'   the workspace and without printing R's own error trace, so the structured
#'   JSON message stays the single source of truth for the failure.
#' @examples
#' \dontrun{
#' if (!file.exists(path)) emit_error(sprintf("Input not found: %s", path))
#' }
emit_error <- function(message) {
  cat(jsonlite::toJSON(
    list(
      type    = "error",
      message = as.character(message)
    ),
    auto_unbox = TRUE
  ), "\n")
  flush.console()

  # Exit immediately, non-zero, without R's own error logging: the emitted JSON
  # above is the definitive error report for the backend.
  quit(save = "no", status = 1)
}

#' Emit a completion event with an arbitrary result payload.
#'
#' Writes a single \code{{"type":"done",...}} JSON line to stdout to signal that
#' the script finished successfully. Any named arguments are merged into the JSON
#' object, letting each script return its own result metadata (output paths,
#' counts, flags, ...).
#'
#' @param ... Named arguments added as extra fields of the \code{done} event
#'   (e.g. \code{output_csv = path}, \code{total_dmps = n}). Values are unboxed,
#'   so pass length-1 scalars unless an array is intended.
#' @return Invisibly \code{NULL}; called for its stdout side effect.
#' @examples
#' \dontrun{
#' emit_done(output_csv = "/app/jobs/<id>/dmp_results.csv", total_dmps = 930075)
#' }
emit_done <- function(...) {
  msg <- c(list(type = "done"), list(...))
  cat(jsonlite::toJSON(msg, auto_unbox = TRUE), "\n")
  flush.console()
}
