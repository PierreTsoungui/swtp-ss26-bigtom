# r_backend/utils/columns.R
#
# Case-insensitive, candidate-based column access.
#
# The exact column names of the tables this pipeline consumes are not stable:
# ChAMP's DMP/DMR result tables and minfi annotations differ slightly between the
# 450K, EPIC v1 and EPIC v2 platforms (e.g. "CHR" vs "chr", "gene" vs "Gene",
# "p.value" vs "p.valueArea"). Hard-coding one spelling makes a script break on a
# different array. These helpers look a column up tolerantly so the analysis code
# stays robust across all supported arrays.
#
# Usage:
#   source("/app/r_backend/utils/columns.R")
#   chr <- pick_col(dmp_table, c("CHR", "chr"))          # first available
#   if (has_col_ci(df, "pos")) pos <- get_col_ci(df, "pos")
#
# Depends only on base R; safe to source anywhere. Works with data frames,
# tibbles and matrices.

#' Extract a column by name or index, supporting data frames and matrices.
#'
#' @param df A data frame, tibble or matrix.
#' @param key A column name (character) or 1-based index.
#' @return The selected column vector.
#' @keywords internal
.column_extract <- function(df, key) {
  if (is.data.frame(df)) df[[key]] else df[, key]
}

#' Index of the first column matching \code{name} case-insensitively.
#'
#' @param df A data frame, tibble or matrix.
#' @param name A single column name to look up.
#' @return The integer column index, or \code{NA_integer_} if not found.
#' @keywords internal
.column_index_ci <- function(df, name) {
  cols <- colnames(df)
  if (is.null(cols) || length(cols) == 0L || length(name) != 1L || is.na(name)) {
    return(NA_integer_)
  }
  match(tolower(name), tolower(cols))
}

#' Test whether a column exists (case-insensitive).
#'
#' @param df A data frame, tibble or matrix.
#' @param name A single column name.
#' @return \code{TRUE} if a column matches \code{name} ignoring case, else \code{FALSE}.
#' @examples
#' has_col_ci(data.frame(CHR = 1), "chr") # TRUE
has_col_ci <- function(df, name) !is.na(.column_index_ci(df, name))

#' Get a column by name (case-insensitive), or a fallback when it is absent.
#'
#' @param df A data frame, tibble or matrix.
#' @param name A single column name.
#' @param fallback Value returned when the column is absent (default \code{NULL}).
#' @return The matching column, or \code{fallback}.
get_col_ci <- function(df, name, fallback = NULL) {
  idx <- .column_index_ci(df, name)
  if (is.na(idx)) fallback else .column_extract(df, idx)
}

#' Get the first available column among several candidate names.
#'
#' Resolution order, following candidate priority:
#' \enumerate{
#'   \item an \emph{exact} (case-sensitive) name match — the first candidate that
#'         matches exactly wins, so a precise spelling is always preferred;
#'   \item otherwise a \emph{case-insensitive} match, again in candidate order.
#' }
#' Returns \code{fallback} when no candidate matches.
#'
#' @param df A data frame, tibble or matrix.
#' @param candidates Character vector of column names, highest priority first.
#' @param fallback Value returned when none of the candidates match (default \code{NA}).
#' @return The first matching column, or \code{fallback}.
#' @examples
#' pick_col(data.frame(chr = 1:2), c("CHR", "chr")) # the lowercase "chr" column
pick_col <- function(df, candidates, fallback = NA) {
  cols <- colnames(df)
  if (is.null(cols) || length(cols) == 0L || length(candidates) == 0L) {
    return(fallback)
  }

  # Pass 1: exact match (precise spelling wins over a fuzzy one).
  exact <- candidates[candidates %in% cols]
  if (length(exact) > 0L) {
    return(.column_extract(df, exact[1]))
  }

  # Pass 2: case-insensitive match, honouring candidate order.
  lc <- tolower(cols)
  for (cand in candidates) {
    idx <- match(tolower(cand), lc)
    if (!is.na(idx)) {
      return(.column_extract(df, idx))
    }
  }

  fallback
}
