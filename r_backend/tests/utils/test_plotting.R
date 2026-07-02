# =============================================================================
# UNIT TESTS: utils/plotting.R
#
# render_png_and_pdf(): write the SAME figure to a PNG (mandatory) and a vector
# PDF (best-effort) from one drawing routine, always closing exactly the device
# it opened. Depends only on base R / grDevices, so it is fully unit-testable.
# =============================================================================

library(testthat)
source("/app/r_backend/utils/plotting.R")

# PNG / PDF magic-byte checks.
file_has_magic <- function(path, magic) {
  if (!file.exists(path)) {
    return(FALSE)
  }
  con <- file(path, "rb")
  on.exit(close(con))
  bytes <- readBin(con, what = "raw", n = length(magic))
  length(bytes) == length(magic) && all(bytes == magic)
}
is_png <- function(p) file_has_magic(p, as.raw(c(0x89, 0x50, 0x4E, 0x47)))
is_pdf <- function(p) file_has_magic(p, as.raw(c(0x25, 0x50, 0x44, 0x46)))

# A size-independent drawing routine: grid graphics have no base-plot margin
# constraints, so it renders on canvases of any size (base plot() would raise
# "figure margins too large" on the small devices some tests use).
simple_plot <- function() {
  grid::grid.newpage()
  grid::grid.rect(gp = grid::gpar(fill = "steelblue"))
}

test_that("render_png_and_pdf writes a valid PNG and a valid PDF from one routine", {
  png <- tempfile(fileext = ".png")
  on.exit(unlink(c(png, sub("\\.png$", ".pdf", png))), add = TRUE)
  res <- render_png_and_pdf(png, draw_fn = simple_plot, width = 600, height = 400, res = 100)

  expect_true(is_png(png))
  expect_true(is_pdf(res$pdf_path))
  expect_true(res$pdf_ok)
  expect_equal(res$png_path, png)
})

test_that("the PDF path is derived from the PNG path by default", {
  png <- tempfile(fileext = ".png")
  on.exit(unlink(c(png, sub("\\.png$", ".pdf", png))), add = TRUE)
  res <- render_png_and_pdf(png, draw_fn = simple_plot, width = 300, height = 300)
  expect_equal(res$pdf_path, sub("\\.png$", ".pdf", png))
  expect_true(file.exists(res$pdf_path))
})

test_that("the 'in' units path produces valid output", {
  png <- tempfile(fileext = ".png")
  on.exit(unlink(c(png, sub("\\.png$", ".pdf", png))), add = TRUE)
  res <- render_png_and_pdf(png, draw_fn = simple_plot, width = 5, height = 4, res = 100, units = "in")
  expect_true(is_png(png))
  expect_true(res$pdf_ok)
})

test_that("render_png_and_pdf validates its dimension/resolution arguments", {
  png <- tempfile(fileext = ".png")
  expect_error(render_png_and_pdf(png, simple_plot, width = 0, height = 100))
  expect_error(render_png_and_pdf(png, simple_plot, width = 100, height = -1))
  expect_error(render_png_and_pdf(png, simple_plot, width = 100, height = 100, res = 0))
  expect_error(render_png_and_pdf(png, draw_fn = "not a function", width = 10, height = 10))
})

test_that("a failing PDF only disables the download: PNG is still written, callback fired", {
  # An unwritable PDF path (non-existent directory) makes the best-effort PDF
  # fail without aborting; the PNG must still be produced.
  png <- tempfile(fileext = ".png")
  on.exit(unlink(png), add = TRUE)
  captured <- NULL
  # The unwritable PDF path makes the graphics device emit an (expected) R warning
  # before failing; the contract we assert is the callback + the intact PNG.
  res <- suppressWarnings(render_png_and_pdf(
    png,
    draw_fn = simple_plot, width = 300, height = 300,
    pdf_path = "/no/such/dir/out.pdf",
    on_pdf_error = function(msg) captured <<- msg
  ))
  expect_true(is_png(png))
  expect_false(res$pdf_ok)
  expect_false(is.null(captured)) # the callback was invoked with a message
})

test_that("a failing PNG (mandatory) raises an error", {
  expect_error(
    render_png_and_pdf("/no/such/dir/out.png", draw_fn = simple_plot, width = 300, height = 300)
  )
})

test_that("render_png_and_pdf leaves no graphics device open", {
  before <- length(grDevices::dev.list())
  png <- tempfile(fileext = ".png")
  on.exit(unlink(c(png, sub("\\.png$", ".pdf", png))), add = TRUE)
  render_png_and_pdf(png, draw_fn = simple_plot, width = 200, height = 200)
  expect_equal(length(grDevices::dev.list()), before) # devices always closed
})
