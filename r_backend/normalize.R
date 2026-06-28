#!/usr/bin/env Rscript
# r_backend/normalize.R
#
#' Normalization step of the methylation-analysis pipeline.
#'
#' Loads the sample-filtered \code{RGChannelSet} produced by \code{init_filter.R}
#' and applies the user-selected normalization method, then validates and
#' persists the result for the downstream steps (batch correction, DMP/DMR,
#' heatmap).
#'
#' The script is array-agnostic: \pkg{minfi} detects the platform (450K,
#' EPIC v1, EPIC v2) automatically from the data and uses the matching
#' annotation, so no array-specific handling is required here.
#'
#' @section Usage:
#' \code{Rscript normalize.R <job_dir> <method>}
#'
#' @section Arguments:
#' \describe{
#'   \item{job_dir}{Directory containing \code{filtered_data.rds}; the output is
#'     written here as \code{normalized_data.rds}.}
#'   \item{method}{One of \code{noob}, \code{quantile}, \code{swan},
#'     \code{funnorm} (see \code{\link{NORMALIZATION_METHODS}}).}
#' }
#'
#' @section Output:
#' \code{normalized_data.rds} — the full normalized minfi object (a
#' \code{MethylSet} for NOOB/SWAN, a \code{GenomicRatioSet} for
#' QUANTILE/FUNNORM). The whole object is saved so downstream steps keep all
#' annotations and metadata.
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON
#' (\code{{"type":"progress",...}}, \code{{"type":"error",...}},
#' \code{{"type":"done",...}}).


# ── Environment setup ─────────────────────────────────────────────────────────
# Pin every numerical backend to a single thread. The container ships a
# single-threaded preprocessCore (see r_backend/Dockerfile) precisely because
# multi-threaded normalization (QUANTILE/FUNNORM) can core-dump here; mirror that
# constraint at runtime so the behaviour is deterministic and crash-free.
Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")
Sys.setenv(NUMEXPR_NUM_THREADS = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")

suppressPackageStartupMessages({
  library(minfi)
})

# Shared progress / error / done emitters.
source("/app/r_backend/utils/progress.R")

# Force serial execution: some normalizations dispatch to parallel backends.
BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
options(mc.cores = 1)

if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
}


# ── Normalization method registry ─────────────────────────────────────────────

#' Registry of supported normalization methods.
#'
#' Maps a method id to a function \code{function(rgset) -> normalized object}.
#' This is the single extension point: adding a method means adding one entry
#' here; nothing else in the script changes.
#'
#' Biological notes:
#' \itemize{
#'   \item \code{noob} — Normal-exponential out-of-band background + dye-bias
#'     correction (robust default).
#'   \item \code{quantile} — Stratified quantile normalization.
#'   \item \code{swan} — Subset-quantile within-array normalization; balances
#'     Infinium Type I/II probe designs.
#'   \item \code{funnorm} — Functional normalization using control probes; well
#'     suited to datasets with large global differences (e.g. tumor vs. normal).
#' }
NORMALIZATION_METHODS <- list(
  noob     = function(rgset) preprocessNoob(rgset),
  quantile = function(rgset) preprocessQuantile(rgset),
  swan     = function(rgset) {
    # preprocessSWAN needs the per-probe design from a MethylSet; build it
    # explicitly so the input is unambiguous.
    preprocessSWAN(rgset, mSet = preprocessRaw(rgset))
  },
  funnorm  = function(rgset) {
    # nPCs must stay below the sample count; clamp for small cohorts.
    n_pcs <- min(2L, max(1L, ncol(rgset) - 1L))
    preprocessFunnorm(rgset, nPCs = n_pcs)
  }
)


# ── Helpers ───────────────────────────────────────────────────────────────────

#' Load and validate the filtered RGChannelSet.
#'
#' @param job_dir Directory expected to contain \code{filtered_data.rds}.
#' @return The loaded \code{RGChannelSet}; emits a fatal error on any problem.
load_filtered_rgset <- function(job_dir) {
  rds_path <- file.path(job_dir, "filtered_data.rds")
  if (!file.exists(rds_path)) {
    emit_error(sprintf("filtered_data.rds not found in: %s", job_dir))
  }

  rgset <- tryCatch(
    readRDS(rds_path),
    error = function(e) {
      emit_error("Could not read filtered_data.rds. The file may be corrupted.")
    }
  )

  # All supported methods require the raw channel data; reject anything else
  # with a clear message instead of failing cryptically inside minfi.
  if (!methods::is(rgset, "RGChannelSet")) {
    emit_error("filtered_data.rds has an unexpected format (expected an RGChannelSet). Please re-run the filtering step.")
  }
  if (ncol(rgset) < 1L || nrow(rgset) < 1L) {
    emit_error("The filtered data contains no samples or no probes.")
  }

  rgset
}

#' Apply a normalization method to an RGChannelSet.
#'
#' Looks the method up in \code{\link{NORMALIZATION_METHODS}} and runs it
#' defensively so a failure produces a clear, structured error.
#'
#' @param rgset The raw \code{RGChannelSet}.
#' @param method Method id (must be a key of \code{NORMALIZATION_METHODS}).
#' @return The normalized minfi object.
normalize_rgset <- function(rgset, method) {
  normalize_fn <- NORMALIZATION_METHODS[[method]]

  # Fixed seed for reproducibility: preprocessSWAN() randomly subsets probes and
  # is otherwise non-deterministic — without a seed, two runs of the same data
  # produce slightly different beta values, which propagate into the DMP/DMR
  # averages, Δβ magnitudes and p-values. The other methods are deterministic, so
  # seeding is harmless for them.
  set.seed(42)

  tryCatch(
    normalize_fn(rgset),
    error = function(e) {
      emit_error(sprintf("Normalization with method '%s' failed: %s", method, conditionMessage(e)))
    }
  )
}

#' Validate that a normalized object yields beta values in the expected range.
#'
#' @param normalized A normalized minfi object.
#' @return Invisibly \code{TRUE}; emits a fatal error if beta values are invalid.
assert_valid_beta <- function(normalized) {
  beta <- tryCatch(
    getBeta(normalized),
    error = function(e) emit_error(paste("Could not extract beta values:", conditionMessage(e)))
  )

  if (is.null(beta) || length(beta) == 0L) {
    emit_error("Normalization produced an empty beta matrix.")
  }
  if (all(is.na(beta))) {
    emit_error("Normalization produced only NA beta values.")
  }
  # Beta is methylation fraction and must lie within [0, 1].
  if (any(beta < 0 | beta > 1, na.rm = TRUE)) {
    emit_error("Beta values outside the valid range [0, 1] after normalization.")
  }

  invisible(TRUE)
}


# ── Main execution ────────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2L) {
  emit_error("Too few arguments. Expected: <job_dir> <method>")
}
job_dir <- args[1]
method  <- tolower(args[2])

if (!method %in% names(NORMALIZATION_METHODS)) {
  emit_error(sprintf(
    "Invalid method: %s. Allowed: %s",
    method, paste(names(NORMALIZATION_METHODS), collapse = ", ")
  ))
}

emit_progress(0, "Starting normalization")

# Load the filtered data.
emit_progress(10, "Loading filtered data")
rgset <- load_filtered_rgset(job_dir)

# Log the auto-detected array type for traceability (450K / EPIC / EPIC v2).
array_info <- tryCatch(paste(annotation(rgset), collapse = " / "), error = function(e) "unknown")
emit_progress(15, sprintf("Data loaded - Samples: %d, Probes: %d, Array: %s",
                          ncol(rgset), nrow(rgset), array_info))

# Normalize.
emit_progress(30, paste("Normalizing with method:", method))
normalized <- normalize_rgset(rgset, method)

# Validate.
emit_progress(70, "Validating data quality")
assert_valid_beta(normalized)

# Persist the full normalized object (keeps annotations + metadata downstream).
emit_progress(85, "Saving normalized object")
output_rds <- file.path(job_dir, "normalized_data.rds")
tryCatch(
  saveRDS(normalized, output_rds),
  error = function(e) emit_error(paste("Could not save normalized data:", conditionMessage(e)))
)
if (!file.exists(output_rds)) {
  emit_error("Normalized data file was not created.")
}

emit_progress(100, "Normalization complete")
emit_done(method = method, output = output_rds)
