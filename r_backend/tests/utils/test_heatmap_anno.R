# =============================================================================
# UNIT TESTS: utils/heatmap_anno.R
#
# Annotation helpers for the sample heatmap: build_colours (qualitative palette
# with recycling) and make_anno_spec (categorical -> discrete swatches vs.
# many-valued numeric -> continuous gradient). make_anno_spec builds a gradient
# with circlize::colorRamp2, so circlize must be available.
# =============================================================================

library(testthat)
suppressWarnings(suppressMessages(library(circlize)))
source("/app/r_backend/utils/heatmap_anno.R")

test_that("build_colours assigns one colour per distinct level", {
  cols <- build_colours(c("A", "B", "A", "C"))
  expect_setequal(names(cols), c("A", "B", "C"))
  expect_true(all(grepl("^#[0-9A-Fa-f]{6}$", cols)))
})

test_that("build_colours recycles the 12-colour palette beyond 12 levels", {
  many <- build_colours(paste0("L", 1:15))
  expect_length(many, 15L)
  expect_equal(unname(many["L13"]), unname(many["L1"]))
})

test_that("make_anno_spec draws a categorical column as discrete swatches", {
  spec <- make_anno_spec("Group", c("Case", "Ctrl", "Case", "Ctrl"))
  expect_equal(spec$kind, "discrete")
  expect_type(spec$col, "character")                 # named colour vector
  expect_true(all(c("Case", "Ctrl") %in% names(spec$col)))
})

test_that("make_anno_spec draws a many-valued numeric column as a continuous gradient", {
  spec <- make_anno_spec("Age", as.character(20:40))  # 21 distinct numerics
  expect_equal(spec$kind, "continuous")
  expect_true(is.function(spec$col))                 # colorRamp2 function
  expect_true(is.numeric(spec$values))
})

test_that("make_anno_spec keeps a low-cardinality numeric column discrete", {
  # A small numeric code (batch id) must stay categorical, not become a gradient.
  spec <- make_anno_spec("Batch", as.character(c(1, 2, 3, 1, 2)))
  expect_equal(spec$kind, "discrete")
})

test_that("make_anno_spec keeps a constant numeric column discrete (degenerate range)", {
  spec <- make_anno_spec("Const", as.character(rep(7, 20)))
  expect_equal(spec$kind, "discrete")
})
