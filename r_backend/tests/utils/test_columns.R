# =============================================================================
# UNIT TESTS: utils/columns.R
#
# Case-insensitive, candidate-based column access used across the pipeline to
# stay robust to the CHR/chr, gene/Gene, p.value/p.valueArea naming differences
# between 450K / EPIC v1 / EPIC v2 tables. Pure base-R helpers -> fully unit
# testable in-process.
# =============================================================================

library(testthat)
source("/app/r_backend/utils/columns.R")

# ── has_col_ci() ──────────────────────────────────────────────────────────────

test_that("has_col_ci matches case-insensitively and reports absence", {
  df <- data.frame(CHR = 1:2, Pos = 3:4)
  expect_true(has_col_ci(df, "chr"))
  expect_true(has_col_ci(df, "CHR"))
  expect_true(has_col_ci(df, "POS"))
  expect_false(has_col_ci(df, "gene"))
})

test_that("has_col_ci tolerates matrices and objects without column names", {
  m <- matrix(1:4, 2, dimnames = list(NULL, c("A", "B")))
  expect_true(has_col_ci(m, "a"))
  expect_false(has_col_ci(matrix(1:4, 2), "A"))   # no colnames
  expect_false(has_col_ci(df <- data.frame(A = 1), NA_character_))
})

# ── get_col_ci() ──────────────────────────────────────────────────────────────

test_that("get_col_ci returns the matching column regardless of case", {
  df <- data.frame(CHR = c("1", "2"), stringsAsFactors = FALSE)
  expect_equal(get_col_ci(df, "chr"), c("1", "2"))
})

test_that("get_col_ci returns the fallback when the column is absent", {
  df <- data.frame(A = 1:2)
  expect_null(get_col_ci(df, "missing"))
  expect_equal(get_col_ci(df, "missing", fallback = -1), -1)
})

test_that("get_col_ci works on a matrix column", {
  m <- matrix(c(10, 20, 30, 40), 2, dimnames = list(NULL, c("x", "y")))
  expect_equal(get_col_ci(m, "Y"), c(30, 40))
})

# ── pick_col() ────────────────────────────────────────────────────────────────

test_that("pick_col prefers an exact match over a case-insensitive one", {
  # Both "chr" and "CHR" exist; the exact candidate must win.
  df <- data.frame(chr = c("a"), CHR = c("b"), stringsAsFactors = FALSE, check.names = FALSE)
  expect_equal(pick_col(df, c("CHR", "chr")), "b")   # exact "CHR" wins
  expect_equal(pick_col(df, c("chr", "CHR")), "a")   # exact "chr" wins
})

test_that("pick_col falls back to a case-insensitive match in candidate order", {
  df <- data.frame(chr = c("a"), stringsAsFactors = FALSE)
  expect_equal(pick_col(df, c("CHR", "chr")), "a")   # no exact "CHR" -> ci "chr"
})

test_that("pick_col honours candidate priority", {
  df <- data.frame(p.value = 0.1, p.valueArea = 0.2, check.names = FALSE)
  expect_equal(pick_col(df, c("p.valueArea", "p.value")), 0.2)   # first candidate present
  expect_equal(pick_col(df, c("p.value", "p.valueArea")), 0.1)
})

test_that("pick_col returns the fallback when nothing matches", {
  df <- data.frame(A = 1)
  expect_true(is.na(pick_col(df, c("B", "C"))))          # default fallback NA
  expect_equal(pick_col(df, c("B"), fallback = "none"), "none")
  expect_equal(pick_col(df, character(0), fallback = 7), 7)   # no candidates
  expect_equal(pick_col(matrix(1:4, 2), c("A"), fallback = 0), 0)   # no colnames
})
