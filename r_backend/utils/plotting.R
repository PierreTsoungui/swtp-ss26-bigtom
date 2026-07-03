# r_backend/utils/plotting.R
#
# Safe dual-device rendering: write the SAME figure to a PNG (for inline display)
# and a vector PDF (for download/print) from a single drawing routine. Every
# static plot in the pipeline (normalization density plots, SVD diagnostic,
# heatmap) is offered as PNG + PDF, so centralising the device handling
# guarantees consistent, robust output and removes three near-duplicate blocks.
#
# DESIGN — why it is built this way
#   * Decoupled: depends only on base R / grDevices (no progress contract), so it
#     is reusable and unit-testable on its own.
#   * The PNG is the primary artifact: if it cannot be written the function RAISES
#     a standard R error, leaving the caller in control of how fatal that is
#     (e.g. normalization wraps each method to emit a placeholder; the heatmap/SVD
#     scripts turn it into a pipeline error).
#   * The PDF is best-effort: a failure NEVER aborts — it is reported through the
#     `on_pdf_error` callback (default: a message()) and signalled in the return
#     value, so a missing PDF only disables the download button.
#   * Devices are ALWAYS closed — exactly the one we opened, only if it opened,
#     never the null device — even when the drawing code throws.
#   * One size model covers both conventions: pass pixels (units = "px") or
#     inches (units = "in"); the PDF is always sized in inches, derived from res
#     for pixel inputs.

#' Run a drawing routine on a freshly opened device and always close it.
#'
#' Opens a device via \code{open_device()}, runs \code{draw_fn()}, and guarantees
#' the device is closed afterwards — but only the device this call opened, and
#' only while it is still the active one (never the R null device, never a device
#' opened elsewhere). If \code{open_device()} itself fails, no device is left
#' dangling. Errors from drawing propagate to the caller.
#'
#' @param open_device A zero-argument function that opens a graphics device.
#' @param draw_fn A zero-argument function that draws onto the current device.
#' @return Invisibly \code{TRUE} on success; errors propagate.
#' @keywords internal
.render_to_device <- function(open_device, draw_fn) {
  open_device() # may error -> nothing to clean up
  dev <- grDevices::dev.cur()
  on.exit(
    if (grDevices::dev.cur() == dev && dev != 1L) grDevices::dev.off(),
    add = TRUE
  )
  draw_fn()
  invisible(TRUE)
}

#' Render a figure to PNG and (best-effort) PDF from one drawing routine.
#'
#' @param png_path Output path for the PNG (should end in \code{.png}).
#' @param draw_fn Zero-argument function that performs the drawing. It is called
#'   once per device, so it must be self-contained (no device-specific state).
#' @param width,height Figure dimensions, interpreted according to \code{units}.
#' @param res Resolution in DPI. Controls the PNG pixel density (and text scaling)
#'   and, for pixel inputs, the inch size of the PDF (\code{px / res}).
#' @param units Either \code{"px"} (default) or \code{"in"} for \code{width}/
#'   \code{height}.
#' @param pdf_path Output path for the PDF; defaults to \code{png_path} with the
#'   extension swapped to \code{.pdf}.
#' @param on_pdf_error Callback \code{function(message)} invoked when the PDF
#'   cannot be written (default: emit a \code{message()}). Lets a caller surface
#'   the skip through its own progress channel without coupling this module to it.
#' @return Invisibly a list: \code{png_path}, \code{pdf_path}, and \code{pdf_ok}
#'   (whether the PDF was written). Raises an error if the PNG cannot be written.
render_png_and_pdf <- function(png_path, draw_fn, width, height, res = 200,
                               units = c("px", "in"), pdf_path = NULL,
                               on_pdf_error = NULL) {
  units <- match.arg(units)
  stopifnot(
    is.function(draw_fn),
    length(width) == 1L, is.finite(width),  width > 0,
    length(height) == 1L, is.finite(height), height > 0,
    length(res) == 1L, is.finite(res),    res > 0
  )
  if (is.null(pdf_path)) pdf_path <- sub("\\.png$", ".pdf", png_path, ignore.case = TRUE)
  if (is.null(on_pdf_error)) on_pdf_error <- function(msg) message("PDF export failed: ", msg)

  # Prefer the cairo PNG backend (consistent anti-aliasing, headless-safe); fall
  # back to the platform default only if cairo is unavailable.
  png_type <- if (isTRUE(capabilities("cairo"))) "cairo" else "Xlib"

  # ── PNG (primary; mandatory) ────────────────────────────────────────────────
  .render_to_device(
    open_device = function() {
      grDevices::png(png_path,
        width = width, height = height,
        units = units, res = res, type = png_type
      )
    },
    draw_fn = draw_fn
  )
  if (!file.exists(png_path)) {
    stop(sprintf("PNG was not created at expected path: %s", png_path))
  }

  # ── PDF (vector; best-effort) ───────────────────────────────────────────────
  pdf_w <- if (units == "in") width else width / res
  pdf_h <- if (units == "in") height else height / res
  pdf_ok <- tryCatch(
    {
      .render_to_device(
        open_device = function() {
          # cairo_pdf gives true vector output with proper fonts; fall back to the
          # base pdf() device if cairo is missing or fails to open.
          if (isTRUE(capabilities("cairo"))) {
            tryCatch(
              grDevices::cairo_pdf(pdf_path, width = pdf_w, height = pdf_h),
              error = function(e) grDevices::pdf(pdf_path, width = pdf_w, height = pdf_h)
            )
          } else {
            grDevices::pdf(pdf_path, width = pdf_w, height = pdf_h)
          }
        },
        draw_fn = draw_fn
      )
      TRUE
    },
    error = function(e) {
      on_pdf_error(conditionMessage(e))
      FALSE
    }
  )

  invisible(list(png_path = png_path, pdf_path = pdf_path, pdf_ok = pdf_ok))
}
