# r_backend/utils/stats.R
#
# Fast per-row summary statistics with a single, consistent implementation.
#
# Several steps need the variance / standard deviation of every probe (row):
# dropping invariant probes and selecting the most variable probes for PCA. The
# fast way is matrixStats (C-level), but it is an optional dependency, so the
# code kept repeating a "use matrixStats if available, else base R" branch. This
# module centralises that branch in one place.
#
# IMPORTANT — consistency: matrixStats::rowVars / rowSds compute the SAMPLE
# variance/sd (divisor n-1), exactly like base stats::var / sd. The base-R
# fallbacks here use var()/sd() too, so both paths agree numerically (a previous
# hand-rolled `rowMeans(m^2) - rowMeans(m)^2` fallback was the POPULATION
# variance and silently disagreed with the matrixStats path).
#
# Depends only on base R; matrixStats is used when present. Leaf module: it does
# not depend on any other project utility.

# Resolved once at load: is the fast C-level backend available?
.HAS_MATRIXSTATS <- requireNamespace("matrixStats", quietly = TRUE)

#' Coerce to a numeric matrix (no-op for matrices).
#'
#' @param m A matrix or coercible object (e.g. data.frame).
#' @return A matrix.
#' @keywords internal
.as_matrix <- function(m) if (is.matrix(m)) m else as.matrix(m)

#' Per-row sample variance.
#'
#' @param m A numeric matrix (rows = features, columns = samples).
#' @param na_rm Remove \code{NA} values per row before computing (default
#'   \code{FALSE}, matching \code{stats::var} / \code{matrixStats::rowVars}).
#' @return A numeric vector with one variance per row.
row_variance <- function(m, na_rm = FALSE) {
  m <- .as_matrix(m)
  if (.HAS_MATRIXSTATS) {
    matrixStats::rowVars(m, na.rm = na_rm)
  } else {
    apply(m, 1L, stats::var, na.rm = na_rm)
  }
}

#' Per-row sample standard deviation.
#'
#' @param m A numeric matrix (rows = features, columns = samples).
#' @param na_rm Remove \code{NA} values per row before computing (default
#'   \code{FALSE}).
#' @return A numeric vector with one standard deviation per row.
row_sd <- function(m, na_rm = FALSE) {
  m <- .as_matrix(m)
  if (.HAS_MATRIXSTATS) {
    matrixStats::rowSds(m, na.rm = na_rm)
  } else {
    # Equivalent to apply(m, 1, sd); reuse row_variance to stay DRY and correct.
    sqrt(row_variance(m, na_rm = na_rm))
  }
}
