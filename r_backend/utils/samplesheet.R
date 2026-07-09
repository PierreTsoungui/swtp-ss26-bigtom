# r_backend/utils/samplesheet.R
#
# Single source of truth for HOW the backend reads an Illumina sample sheet and,
# crucially, WHAT the column names are. The Python column detection
# (get_available_columns_from_samplesheet) and every R script must agree on the
# raw column names exactly as they appear in the sheet's [Data] section
# (Sample_Group, Sentrix_ID, Sentrix_Position, ...).
#
# IMPORTANT: do NOT read sample sheets via minfi::read.metharray.sheet() for
# metadata. It renames Sentrix_ID -> Slide and Sentrix_Position -> Array, which
# breaks the contract above: a batch variable the API offers ("Sentrix_Position")
# would then be invisible to the R script.
#
# This module also provides the generic sample/matrix aligner
# (align_samples_to_matrix) and the case/control resolver (resolve_case_control)
# shared by the DMP/DMR/SVD/batch-correction scripts.
#
# NOTE: align_samples_to_matrix() and resolve_case_control() report fatal
# problems via emit_error(), so utils/progress.R must be sourced first.

suppressPackageStartupMessages(library(readr))


#' Reads the [Data] section of a sample sheet, preserving the original column
#' names. Skips the [Header] block so the data column row becomes the header.
#'
#' @param path Path to the SampleSheet CSV.
#' @return A data.frame with the raw sample-sheet columns.
read_sample_sheet_smart <- function(path) {
  lines <- readLines(path, warn = FALSE)
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0
  as.data.frame(read_csv(path, skip = skip_n, show_col_types = FALSE))
}


#' Normalizes an identifier for robust matching by stripping all whitespace.
#'
#' @param x A character vector (or coercible).
#' @return The cleaned character vector.
normalize_id <- function(x) {
  x <- as.character(x)
  x <- gsub("[[:space:]]+", "", x)
  x <- gsub("\r|\n|\t", "", x)
  x
}


#' Builds the combined array id (chip + position) used to match sample-sheet
#' rows to beta-matrix columns, e.g. "206891110001_R01C01".
#'
#' @param samples A data.frame from read_sample_sheet_smart().
#' @return A character vector of array ids.
sample_sheet_array_id <- function(samples) {
  paste0(samples$Sentrix_ID, "_", samples$Sentrix_Position)
}


#' The per-sample identity that matches the loaded data's column names.
#'
#' minfi's \code{read.metharray.exp()} names every loaded sample
#' \code{basename(Basename)}. The canonical sheet carries an explicit
#' \code{Basename} column only for the alternative IDAT-naming convention; in the
#' standard case the id is the chip array id (\code{Sentrix_ID_Sentrix_Position}).
#' This returns the key that joins sample-sheet rows to (beta-)matrix columns,
#' preferring \code{Basename} when present.
#'
#' @param samples A data.frame from \code{read_sample_sheet_smart()}.
#' @return A character vector of per-sample match ids (\code{NA} where it cannot
#'   be derived).
sample_sheet_match_id <- function(samples) {
  if ("Basename" %in% colnames(samples)) {
    return(basename(as.character(samples$Basename)))
  }
  if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(samples))) {
    return(sample_sheet_array_id(samples))
  }
  rep(NA_character_, nrow(samples))
}


# ── Sample / matrix alignment ─────────────────────────────────────────────────

#' Strip IDAT name decorations from an identifier.
#'
#' Turns e.g. \code{"/path/203_R01C01_Grn.idat"} into \code{"203_R01C01"}.
#'
#' @param x A character vector of (possibly decorated) identifiers.
#' @return The bare identifiers.
#' @keywords internal
.strip_idat_suffix <- function(x) {
  gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(as.character(x)), ignore.case = TRUE)
}

#' Align sample-sheet rows to the columns of a (beta) matrix.
#'
#' The single, robust aligner shared by every analysis script. It matches the
#' matrix columns to sample-sheet rows by the best-covering identifier — trying
#' \code{Basename} (the identity minfi assigns when the alternative IDAT-naming
#' convention is used), then \code{Sample_Name}, then the combined \code{Array_ID}
#' (Sentrix_ID_Sentrix_Position) — using whitespace-normalised comparison. The
#' behaviour when not every column matches is selected via \code{mode}:
#' \describe{
#'   \item{\code{"strict"}}{Every matrix column must map 1:1 to a row, else a
#'     fatal error. The matrix is returned unchanged; rows are reordered to the
#'     matrix's column order. (Used by DMP/DMR.)}
#'   \item{\code{"intersect"}}{Keep only the samples present in both; the matrix
#'     and sheet are subset and reordered consistently. Requires at least
#'     \code{min_common} shared samples. Falls back to positional order when no
#'     identifier matches at all. (Used by the SVD diagnostic.)}
#'   \item{\code{"positional"}}{Use a full identifier match if available,
#'     otherwise assume the sheet is already in matrix-column order (with a
#'     warning). (Used by batch correction.)}
#' }
#' A chosen identifier column with duplicate values is rejected, so alignment is
#' never silently ambiguous.
#'
#' @param beta A matrix whose columns are samples (e.g. a beta matrix).
#' @param samples A sample-sheet data frame.
#' @param mode Alignment strategy; one of \code{"strict"}, \code{"intersect"},
#'   \code{"positional"}.
#' @param strip_idat When \code{TRUE}, strip IDAT decorations from the matrix
#'   column names before matching (the channel data carries \code{_Grn}/\code{_Red}
#'   suffixes that the sheet ids do not).
#' @param min_common Minimum number of shared samples required in
#'   \code{"intersect"} mode (default 2).
#' @return A list with the aligned \code{beta} and \code{samples} (parallel in
#'   order), the \code{id_col} used (or \code{NA}) and the \code{method}
#'   (\code{"id"} or \code{"positional"}).
align_samples_to_matrix <- function(beta, samples,
                                    mode = c("strict", "intersect", "positional"),
                                    strip_idat = FALSE,
                                    min_common = 2L) {
  mode <- match.arg(mode)
  samples <- as.data.frame(samples, stringsAsFactors = FALSE)
  n_cols <- ncol(beta)
  if (is.null(n_cols) || n_cols == 0L) {
    emit_error("Cannot align: the matrix has no sample columns.")
  }

  # Matrix-column identifiers (normalised; optionally stripped of IDAT suffixes).
  beta_raw <- colnames(beta)
  beta_ids <- if (isTRUE(strip_idat)) {
    normalize_id(.strip_idat_suffix(beta_raw))
  } else {
    normalize_id(beta_raw)
  }

  # Candidate identifiers, highest priority first. When a Basename column is
  # present, minfi names the loaded sample columns basename(Basename), so it is
  # the most reliable key and wins ties; Sample_Name and the chip Array_ID follow.
  # Array_ID is also attached as a column for backward compatibility with callers
  # that reference it (e.g. batch_svd excludes it from grouping variables).
  if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(samples))) {
    samples$Array_ID <- sample_sheet_array_id(samples)
  } else if (!"Array_ID" %in% colnames(samples)) {
    samples$Array_ID <- NA_character_
  }
  id_sources <- list()
  if ("Basename" %in% colnames(samples)) {
    id_sources[["Basename"]] <- basename(as.character(samples$Basename))
  }
  if ("Sample_Name" %in% colnames(samples)) {
    id_sources[["Sample_Name"]] <- as.character(samples$Sample_Name)
  }
  id_sources[["Array_ID"]] <- as.character(samples$Array_ID)

  # Pick the identifier with the highest coverage of the matrix columns (strict
  # '>' keeps the higher-priority source on ties).
  best_col <- NA_character_
  best_cov <- 0
  for (cc in names(id_sources)) {
    ids <- normalize_id(id_sources[[cc]])
    if (all(is.na(ids) | !nzchar(ids) | ids == "NA")) next # carries no usable id
    cov <- mean(beta_ids %in% ids)
    if (cov > best_cov) {
      best_cov <- cov
      best_col <- cc
    }
  }

  # Reject ambiguous (duplicated) values in the chosen identifier.
  assert_unique_ids <- function(col) {
    ids <- normalize_id(id_sources[[col]])
    ids <- ids[nzchar(ids)]
    if (anyDuplicated(ids)) {
      emit_error(sprintf("Sample sheet has duplicate '%s' identifiers; cannot align unambiguously.", col))
    }
  }

  # --- Full 1:1 identifier match: valid for every mode ---
  if (best_cov == 1) {
    assert_unique_ids(best_col)
    idx <- match(beta_ids, normalize_id(id_sources[[best_col]]))
    return(list(
      beta = beta, samples = samples[idx, , drop = FALSE],
      id_col = best_col, method = "id"
    ))
  }

  if (mode == "strict") {
    emit_error("Sample alignment failed: some matrix columns have no matching sample-sheet entry.")
  }

  if (mode == "intersect" && !is.na(best_col)) {
    assert_unique_ids(best_col)
    ids <- normalize_id(id_sources[[best_col]])
    common <- intersect(beta_ids, ids)
    if (length(common) < min_common) {
      emit_error(sprintf(
        "Sample ID mismatch: only %d matching sample(s) between data and sample sheet (minimum %d).",
        length(common), min_common
      ))
    }
    keep <- beta_ids %in% common
    beta_sub <- beta[, keep, drop = FALSE]
    order_idx <- match(beta_ids[keep], ids)
    return(list(
      beta = beta_sub, samples = samples[order_idx, , drop = FALSE],
      id_col = best_col, method = "id"
    ))
  }

  # --- Positional fallback (positional mode, or intersect with no matches) ---
  if (nrow(samples) < n_cols) {
    emit_error(sprintf(
      "Sample sheet has fewer rows (%d) than the data has samples (%d); cannot align.",
      nrow(samples), n_cols
    ))
  }
  warning("Could not match sample identifiers; falling back to positional alignment.")
  list(
    beta = beta, samples = samples[seq_len(n_cols), , drop = FALSE],
    id_col = NA_character_, method = "positional"
  )
}


# ── Case / control resolution ─────────────────────────────────────────────────

#' Resolve the case and control group labels for a two-group comparison.
#'
#' When case/control are not given explicitly, the grouping column must contain
#' exactly two usable (non-empty) levels; they are sorted so the first becomes
#' the control (reference) and the second the case. Validates that the two labels
#' differ and are actually present.
#'
#' @param group_vec Per-sample grouping labels (aligned to the data columns).
#' @param group_column Name of the grouping column (for error messages).
#' @param case_group,control_group Optional explicit labels (\code{""} = auto).
#' @return A list with \code{case} and \code{control}.
resolve_case_control <- function(group_vec, group_column, case_group, control_group) {
  if (!nzchar(case_group) || !nzchar(control_group)) {
    lv <- sort(unique(group_vec[!is.na(group_vec) & nzchar(group_vec)]))
    if (length(lv) != 2L) {
      emit_error(sprintf(
        "Column '%s' has %d usable groups; specify a case and a control group.",
        group_column, length(lv)
      ))
    }
    control_group <- lv[1]
    case_group <- lv[2]
  }
  if (case_group == control_group) emit_error("Case and control group must be different.")
  if (!(case_group %in% group_vec) || !(control_group %in% group_vec)) {
    emit_error(sprintf(
      "Case ('%s') or control ('%s') not present in column '%s'.",
      case_group, control_group, group_column
    ))
  }
  list(case = case_group, control = control_group)
}
