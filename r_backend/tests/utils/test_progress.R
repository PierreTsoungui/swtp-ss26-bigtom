# =============================================================================
# UNIT TESTS: utils/progress.R
#
# The R -> backend progress protocol: single-line JSON on stdout.
#   emit_progress -> {"type":"progress","percent":<int>,"message":<str>}
#   emit_done     -> {"type":"done", ...extra fields...}
#   emit_error    -> {"type":"error","message":<str>} then exit(1)
#
# emit_progress/emit_done are tested in-process by capturing stdout. emit_error
# quits the session, so it is tested via a subprocess (exit code + JSON).
# =============================================================================

library(testthat)
library(jsonlite)
source("/app/r_backend/utils/progress.R")

#' Capture stdout of an emit_* call and parse the single JSON line.
capture_json <- function(expr) {
  out <- capture.output(expr)
  line <- out[nzchar(trimws(out))][1]
  jsonlite::fromJSON(line)
}

test_that("emit_progress writes a well-formed progress event with an integer percent", {
  j <- capture_json(emit_progress(42, "Loading data"))
  expect_equal(j$type, "progress")
  expect_equal(j$percent, 42L)
  expect_equal(j$message, "Loading data")
})

test_that("emit_progress coerces a fractional percent to an integer", {
  j <- capture_json(emit_progress(42.9, "x"))
  expect_equal(j$percent, 42L)               # as.integer() truncates
})

test_that("emit_done writes a done event and merges arbitrary named fields", {
  j <- capture_json(emit_done(output = "res.csv", total = 5))
  expect_equal(j$type, "done")
  expect_equal(j$output, "res.csv")
  expect_equal(j$total, 5L)
})

test_that("emit_done works with no extra fields", {
  j <- capture_json(emit_done())
  expect_equal(j$type, "done")
})

test_that("emit_error prints a JSON error and exits non-zero (subprocess)", {
  code <- "source('/app/r_backend/utils/progress.R'); emit_error('boom happened')"
  out  <- suppressWarnings(system2("Rscript", c("-e", shQuote(code)), stdout = TRUE, stderr = TRUE))
  status <- attr(out, "status") %||% 0L
  status <- if (is.null(attr(out, "status"))) 0L else as.integer(attr(out, "status"))
  expect_equal(status, 1L)

  json_line <- Filter(function(l) grepl("^\\s*\\{", l), out)[1]
  j <- jsonlite::fromJSON(json_line)
  expect_equal(j$type, "error")
  expect_equal(j$message, "boom happened")
})
