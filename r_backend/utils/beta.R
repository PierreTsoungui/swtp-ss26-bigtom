# r_backend/utils/beta.R
#
# Composable building blocks for obtaining and cleaning a methylation beta
# matrix. Every script needs a numeric beta matrix, but from different sources
# (a saved RDS, an in-memory minfi object) and with different cleaning needs
# (clamping to [0,1], dropping invariant probes, imputing NAs). Rather than one
# rigid loader, this module offers small, single-purpose functions that each
# script composes as needed, e.g.:
#
#   beta <- load_beta_matrix(path)                 # read + coerce + validate
#   beta <- clamp_beta(beta)                       # force into [0, 1]
#   beta <- drop_invariant_probes(beta)            # remove constant/NA rows
#   beta <- impute_row_means(beta)                 # fill remaining NAs
#
# DEPENDENCIES
#   - extract_beta() / RGChannelSet handling needs the minfi package.
#   - load_beta_matrix() reports fatal problems via emit_error(), so
#     utils/progress.R must be sourced first.
#   - drop_invariant_probes() uses matrixStats when available (faster), else
#     falls back to base R.
#
# DESIGN
#   - Pure helpers (extract_beta/clamp_beta/drop_invariant_probes/
#     impute_row_means) never quit the process: they return a value or raise a
#     standard R error, so callers stay in control (e.g. a per-method tryCatch).
#   - Only the orchestrator load_beta_matrix() emits a fatal pipeline error.

# Per-row statistics (row_sd / row_variance) come from utils/stats.R.
source("/app/r_backend/utils/stats.R")

#' Coerce any supported object into a numeric beta matrix.
#'
#' Unifies the many shapes the pipeline passes around:
#' \itemize{
#'   \item a plain \code{matrix} / \code{data.frame} -> coerced to numeric;
#'   \item an \code{RGChannelSet}/\code{RGChannelSetExtended} -> preprocessed with
#'         \code{preprocessRaw()} first (raw channel sets have no \code{getBeta});
#'   \item any other minfi S4 object (\code{MethylSet}, \code{GenomicRatioSet},
#'         ...) -> \code{getBeta()}.
#' }
#' Row and column names are preserved.
#'
#' @param obj The object to extract beta values from.
#' @return A numeric beta matrix (probes x samples).
#' @details Raises a standard R error (not a pipeline error) if extraction is not
#'   possible, so callers can catch it where appropriate.
extract_beta <- function(obj) {
  if (is.matrix(obj)) {
    m <- obj
  } else if (is.data.frame(obj)) {
    m <- as.matrix(obj)
  } else if (methods::is(obj, "RGChannelSet") || methods::is(obj, "RGChannelSetExtended")) {
    m <- minfi::getBeta(minfi::preprocessRaw(obj))
  } else if (isS4(obj)) {
    m <- minfi::getBeta(obj)
  } else {
    m <- as.matrix(obj)
  }
  storage.mode(m) <- "numeric"
  m
}

#' Load a beta matrix from an RDS file (read + coerce + validate).
#'
#' The orchestrating loader: it checks the path, reads the RDS, coerces the
#' contents to a numeric beta matrix via \code{\link{extract_beta}}, and verifies
#' the result is non-empty. Any failure is reported as a fatal pipeline error.
#'
#' Cleaning steps (clamping, dropping invariant probes, imputing) are left to the
#' caller — compose them as needed.
#'
#' @param path Path to the \code{.rds} file.
#' @return A non-empty numeric beta matrix (probes x samples).
load_beta_matrix <- function(path) {
  if (!file.exists(path)) {
    emit_error(sprintf("Beta matrix file not found at path: %s", path))
  }
  obj <- tryCatch(
    readRDS(path),
    error = function(e) emit_error(sprintf("Could not read beta RDS '%s': %s", path, conditionMessage(e)))
  )
  beta <- tryCatch(
    extract_beta(obj),
    error = function(e) emit_error(sprintf("Could not extract beta values from '%s': %s", path, conditionMessage(e)))
  )
  if (nrow(beta) == 0L || ncol(beta) == 0L) {
    emit_error("Loaded beta matrix is empty (0 features or 0 samples).")
  }
  beta
}

#' Clamp beta values into a valid range.
#'
#' Only finite values are clamped, so \code{NA}/\code{NaN} are left untouched
#' (they are handled separately by imputation or probe dropping).
#'
#' @param beta A numeric beta matrix.
#' @param lo,hi Inclusive bounds (default the methylation range \code{[0, 1]}).
#' @return The clamped matrix.
clamp_beta <- function(beta, lo = 0, hi = 1) {
  beta[is.finite(beta) & beta < lo] <- lo
  beta[is.finite(beta) & beta > hi] <- hi
  beta
}

#' Remove probes (rows) that carry no usable signal.
#'
#' Drops rows that are constant or (optionally) contain non-finite values. A
#' probe with (near-)zero variance contributes nothing to differential or
#' dimensionality analyses and can destabilise the models.
#'
#' @param beta A numeric beta matrix.
#' @param min_sd Minimum row standard deviation to keep a probe (default
#'   \code{1e-5}). Use \code{0} to keep any non-constant probe.
#' @param require_finite When \code{TRUE} (default), also drop rows that contain
#'   any \code{NA}/\code{NaN}/\code{Inf}.
#' @return The filtered matrix (\code{drop = FALSE}, so it never collapses).
drop_invariant_probes <- function(beta, min_sd = 1e-5, require_finite = TRUE) {
  keep <- rep(TRUE, nrow(beta))
  if (require_finite) keep <- rowSums(!is.finite(beta)) == 0L
  sds  <- row_sd(beta)
  keep <- keep & is.finite(sds) & sds > min_sd
  beta[keep, , drop = FALSE]
}

#' Impute missing values with each probe's row mean.
#'
#' Rows that are entirely \code{NA} cannot be imputed and are dropped first
#' (otherwise the mean is \code{NaN}). Imputation is vectorised, so it scales to
#' the ~900k probes of an EPIC v2 array.
#'
#' @param beta A numeric beta matrix.
#' @param drop_all_na When \code{TRUE} (default), drop fully-\code{NA} rows before
#'   imputing.
#' @return The imputed matrix (\code{drop = FALSE}).
impute_row_means <- function(beta, drop_all_na = TRUE) {
  if (drop_all_na) {
    all_na <- rowSums(is.na(beta)) == ncol(beta)
    if (any(all_na)) beta <- beta[!all_na, , drop = FALSE]
  }
  na_idx <- which(is.na(beta), arr.ind = TRUE)
  if (nrow(na_idx) > 0L) {
    row_means    <- rowMeans(beta, na.rm = TRUE)
    beta[na_idx] <- row_means[na_idx[, 1L]]
  }
  beta
}
