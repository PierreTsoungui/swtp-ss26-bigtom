# =============================================================================
# UNIT TESTS: utils/runtime.R
#
# configure_runtime() pins the worker to single-threaded, serial, reproducible
# execution (thread env vars, mc.cores, BiocParallel SerialParam, BLAS/OMP
# limits). Optional dependencies must be used only when present, so the call
# never fails on a minimal setup.
# =============================================================================

library(testthat)
source("/app/r_backend/utils/runtime.R")

test_that("configure_runtime sets the single-thread environment and returns TRUE", {
  # Start from a clean slate so we observe the function's own effect.
  Sys.unsetenv("OMP_NUM_THREADS")
  res <- configure_runtime()
  expect_true(res) # invisibly TRUE
  expect_equal(Sys.getenv("OMP_NUM_THREADS"), "1")
  expect_equal(Sys.getenv("OPENBLAS_NUM_THREADS"), "1")
  expect_equal(Sys.getenv("MKL_NUM_THREADS"), "1")
  expect_equal(Sys.getenv("NUMEXPR_NUM_THREADS"), "1")
  expect_equal(Sys.getenv("VECLIB_MAXIMUM_THREADS"), "1")
  expect_equal(getOption("mc.cores"), 1L)
})

test_that("configure_runtime works with serial = FALSE (no BiocParallel registration)", {
  expect_true(configure_runtime(serial = FALSE))
})

test_that("configure_runtime is idempotent (safe to call repeatedly)", {
  expect_true(configure_runtime())
  expect_true(configure_runtime())
  expect_equal(Sys.getenv("OMP_NUM_THREADS"), "1")
})
