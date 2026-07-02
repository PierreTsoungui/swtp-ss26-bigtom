# =============================================================================
# UNIT TESTS: utils/stats.R
#
# Per-row SAMPLE variance / sd (divisor n-1) with a matrixStats fast path and a
# base-R fallback that must agree numerically with stats::var / stats::sd. These
# feed invariant-probe dropping and top-variance PCA selection, so correctness
# and the sample-vs-population distinction matter.
# =============================================================================

library(testthat)
source("/app/r_backend/utils/stats.R")

test_that("row_variance equals the base-R SAMPLE variance (divisor n-1)", {
  set.seed(1)
  m <- matrix(rnorm(5 * 4), nrow = 5)
  expect_equal(row_variance(m), apply(m, 1L, stats::var))
  # Explicitly NOT the population variance (which would divide by n).
  pop <- rowMeans(m^2) - rowMeans(m)^2
  expect_false(isTRUE(all.equal(row_variance(m), pop)))
})

test_that("row_sd equals the base-R standard deviation and sqrt(variance)", {
  set.seed(2)
  m <- matrix(rnorm(6 * 3), nrow = 6)
  expect_equal(row_sd(m), apply(m, 1L, stats::sd))
  expect_equal(row_sd(m), sqrt(row_variance(m)))
})

test_that("a constant row has zero variance and sd", {
  m <- matrix(c(0.5, 0.5, 0.5,   0.1, 0.9, 0.5), nrow = 2, byrow = TRUE)
  expect_equal(row_variance(m)[1], 0)
  expect_equal(row_sd(m)[1], 0)
})

test_that("na_rm is honoured and matches base R", {
  m <- matrix(c(1, NA, 3, 5,   2, 4, 6, 8), nrow = 2, byrow = TRUE)
  expect_equal(row_variance(m, na_rm = TRUE), apply(m, 1L, stats::var, na.rm = TRUE))
  expect_equal(row_sd(m, na_rm = TRUE),       apply(m, 1L, stats::sd,  na.rm = TRUE))
  # Without na_rm, a row containing NA yields NA.
  expect_true(is.na(row_variance(m)[1]))
})

test_that("data frames are coerced to a matrix", {
  df <- data.frame(a = c(1, 2), b = c(3, 4), c = c(5, 9))
  expect_equal(row_variance(df), apply(as.matrix(df), 1L, stats::var))
})
