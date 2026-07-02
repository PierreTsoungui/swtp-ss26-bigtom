# r_backend/utils/runtime.R
#
# Single source of truth for the R worker's execution environment. Every script
# shares the same container, where uncontrolled multi-threading in BLAS/OpenMP
# (and parallel Bioconductor backends) causes pthread_create failures, core
# dumps during normalization, and non-deterministic numerical results. This
# module pins everything to a single, serial, reproducible execution.
#
# Usage (at the very top of every script, before heavy libraries/compute):
#   source("/app/r_backend/utils/runtime.R")
#   configure_runtime()
#
# It depends only on base R, so it is safe to source and call before any
# Bioconductor package is attached.

#' Configure a single-threaded, serial, reproducible execution environment.
#'
#' Sets the BLAS/OpenMP thread environment variables, forces serial execution of
#' Bioconductor parallel backends, and clamps BLAS/OpenMP threads at runtime.
#' Optional dependencies (\pkg{BiocParallel}, \pkg{RhpcBLASctl}) are used only
#' when installed, so the function never fails on a minimal setup.
#'
#' Call this once, as early as possible (ideally before the heavy libraries are
#' attached) so the thread limits take effect before any BLAS backend
#' initialises.
#'
#' @param serial Logical; when \code{TRUE} (default) register a
#'   \code{SerialParam()} backend with \pkg{BiocParallel}.
#' @return Invisibly \code{TRUE}.
configure_runtime <- function(serial = TRUE) {
  # 1. Thread environment variables (read by the various numerical backends).
  Sys.setenv(
    OMP_NUM_THREADS        = "1",
    OPENBLAS_NUM_THREADS   = "1",
    MKL_NUM_THREADS        = "1",
    NUMEXPR_NUM_THREADS    = "1",
    VECLIB_MAXIMUM_THREADS = "1"
  )

  # 2. Never let R fork: a single worker keeps memory and threading predictable.
  options(mc.cores = 1L)

  # 3. Force serial Bioconductor execution (e.g. preprocessFunnorm dispatches to
  #    a parallel backend otherwise).
  if (serial && requireNamespace("BiocParallel", quietly = TRUE)) {
    BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
  }

  # 4. Enforce the thread limit at runtime as well (covers backends that read
  #    their thread count lazily rather than from the environment).
  if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
    RhpcBLASctl::blas_set_num_threads(1)
    RhpcBLASctl::omp_set_num_threads(1)
  }

  invisible(TRUE)
}
