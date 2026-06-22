#!/usr/bin/env Rscript
options(digits = 4)

# ── Progress Vertrag einbinden ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")

# ── Shared sample-sheet reader ────────────────────────────────────────────────
# Must read the sheet the same way every other component does (raw [Data]
# column names), so the batch variable the API offers is the one validated here.
source("/app/r_backend/utils/samplesheet.R")

# ── Data Synchronization ─────────────────────────────────────────────────────

#' Synchronizes samplesheet targets with matrix columns.
#'
#' Aligns the order of samplesheet rows to the matrix columns by matching the
#' combined array id (Sentrix_ID_Sentrix_Position) against the beta-matrix
#' column names. Uses the raw sheet column names (see utils/samplesheet.R).
#'
#' @param mat     A numeric beta-value matrix.
#' @param targets A data.frame containing the sample sheet information.
#'
#' @return A data.frame containing aligned samplesheet metadata.
#' @export
sync_samplesheet <- function(mat, targets) {
  clean_mat_ids     <- normalize_id(gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(colnames(mat))))
  clean_targets_ids <- normalize_id(gsub("_Grn.*|_Red.*|\\.idat.*", "", sample_sheet_array_id(targets)))
  matches           <- match(clean_mat_ids, clean_targets_ids)

  if (any(is.na(matches)) || length(matches) != ncol(mat)) {
    return(targets[seq_len(ncol(mat)), , drop = FALSE])
  } else {
    return(targets[matches, , drop = FALSE])
  }
}

# ── Covariate Validation ─────────────────────────────────────────────────────

#' Validates and filters covariates based on variance levels.
#'
#' Ensures that each requested covariate exists in the samplesheet and has
#' at least 2 distinct levels to avoid linear dependency issues.
#'
#' @param targets        A data.frame with aligned samplesheet metadata.
#' @param covariates_str A comma-separated string of requested covariates.
#'
#' @return A character vector of valid covariate names.
#' @export
validate_covariates <- function(targets, covariates_str) {
  valid_covariates <- c()
  
  if (!is.na(covariates_str) && nzchar(trimws(covariates_str))) {
    cov_list <- trimws(unlist(strsplit(covariates_str, ",")))
    for (cov in cov_list) {
      if (cov %in% colnames(targets)) {
        if (length(unique(targets[[cov]])) >= 2L) {
          valid_covariates <- c(valid_covariates, cov)
        } else {
          emit_progress(52, paste0("Info: Ignoring '", cov,
                                   "' due to single-level variance."))
        }
      }
    }
  }
  return(valid_covariates)
}

# ── Batch Variable Validation ────────────────────────────────────────────────

#' Validates a vector of batch variable names against the samplesheet.
#'
#' Each variable must exist in the samplesheet and contain at least 2 distinct
#' levels; variables that fail either check are dropped with a warning.
#'
#' @param targets   A data.frame with aligned samplesheet metadata.
#' @param batch_vars Character vector of requested batch variable names.
#'
#' @return A character vector of valid batch variable names (may be empty).
#' @export
validate_batch_vars <- function(targets, batch_vars) {
  valid <- c()
  for (bv in batch_vars) {
    if (!bv %in% colnames(targets)) {
      emit_progress(55, paste0("Warning: Batch variable '", bv,
                               "' not found in samplesheet – skipping."))
      next
    }
    if (length(unique(targets[[bv]])) < 2L) {
      emit_progress(55, paste0("Warning: Batch variable '", bv,
                               "' has only one level – skipping."))
      next
    }
    valid <- c(valid, bv)
  }
  return(valid)
}

# ── Main Correction Pipeline ─────────────────────────────────────────────────

#' Runs the batch effect correction pipeline using limma::removeBatchEffect.
#'
#' Supports one or more batch variables simultaneously.  The biological group
#' covariate is protected via the design matrix so that it is never removed.
#'
#' @param job_dir        Path to the job directory (contains normalized_data.rds
#'                       and the SampleSheet CSV).
#' @param batch_vars_str Comma-separated batch variable names
#'                       (e.g. "Slide,Array").
#' @param covariates_str Comma-separated biological covariates to protect
#'                       (e.g. "Sample_Group").
#'
#' @return None. Saves corrected_data.rds to job_dir.
#' @export
run_batch_correction <- function(job_dir, batch_vars_str, covariates_str = "") {
  
  emit_progress(0,  "Script initialized – Start Batch-Correction")
  
  emit_progress(10, "Loading Bioconductor packages (limma & minfi)...")
  suppressPackageStartupMessages({
    library(limma)
    library(minfi)
  })
  
  # ── Load samplesheet ────────────────────────────────────────────────────────
  emit_progress(20, "Locating sample sheet and importing files...")
  csv_files <- list.files(job_dir, pattern = ".*SampleSheet.*\\.csv$",
                          full.names = TRUE)
  if (length(csv_files) == 0L) {
    emit_error("Samplesheet not found")
  }
  # Read the raw [Data] section (preserves Sentrix_ID / Sentrix_Position),
  # instead of minfi::read.metharray.sheet which would rename them to Slide /
  # Array and make those batch variables unselectable.
  targets <- read_sample_sheet_smart(csv_files[1])
  
  # ── Load normalized data ────────────────────────────────────────────────────
  data_path <- file.path(job_dir, "normalized_data.rds")
  if (!file.exists(data_path)) {
    emit_error("normalized_data.rds is missing")
  }
  data_obj <- readRDS(data_path)
  
  if (is(data_obj, "RGChannelSet") || is(data_obj, "RGChannelSetExtended")) {
    emit_progress(30, "Raw data object detected. Extrapolating channels...")
    data_obj <- minfi::preprocessRaw(data_obj)
  }
  
  if (is(data_obj, "MethylSet")      || is(data_obj, "GenomicMethylSet") ||
      is(data_obj, "RatioSet")       || is(data_obj, "GenomicRatioSet")) {
    mat <- minfi::getBeta(data_obj)
  } else {
    mat <- as.matrix(data_obj)
  }
  
  # ── Condition matrix ────────────────────────────────────────────────────────
  emit_progress(40, "Conditioning data matrix...")
  mat      <- na.omit(mat)
  row_vars <- apply(mat, 1, var)
  mat      <- mat[row_vars > 0, , drop = FALSE]
  
  # ── Synchronize samplesheet ─────────────────────────────────────────────────
  emit_progress(45, "Synchronizing samplesheet mapping...")
  targets <- sync_samplesheet(mat, targets)
  
  # ── Validate covariates (biological – protected) ────────────────────────────
  emit_progress(50, "Validating design matrix covariates...")
  valid_covariates <- validate_covariates(targets, covariates_str)
  
  if (length(valid_covariates) > 0L) {
    formula_str <- paste("~", paste(valid_covariates, collapse = " + "))
    design <- model.matrix(as.formula(formula_str), data = targets)
  } else {
    design <- model.matrix(~1, data = targets)
  }
  
  # ── Validate batch variables ────────────────────────────────────────────────
  emit_progress(55, "Validating batch variables...")
  batch_vars <- trimws(unlist(strsplit(batch_vars_str, ",")))
  batch_vars <- batch_vars[nzchar(batch_vars)]
  
  if (length(batch_vars) == 0L) {
    emit_error("No batch variables provided. Pass at least one via the second argument.")
  }
  
  valid_batch_vars <- validate_batch_vars(targets, batch_vars)
  
  if (length(valid_batch_vars) == 0L) {
    # None of the requested batch variables exist in the samplesheet (or all
    # had a single level). Returning the uncorrected matrix here would let the
    # job report success while no correction was applied — so fail loudly
    # instead. emit_error() quits with status 1 -> the executor maps this to
    # FAILED and the user sees the real reason.
    emit_error(paste0(
      "No valid batch variables remain after validation: '",
      paste(batch_vars, collapse = "', '"),
      "'. None exist in the samplesheet (as read by minfi) or all have only a ",
      "single level. No correction was applied."
    ))
  } else {
    # ── Build batch arguments for removeBatchEffect ─────────────────────────
    # limma::removeBatchEffect accepts:
    #   batch  – first  batch factor (required)
    #   batch2 – second batch factor (optional)
    #   covariates – additional numeric covariates (not used here; biological
    #                protection is handled via the design matrix)
    emit_progress(60, paste0(
      "Executing limma::removeBatchEffect for batch variable(s): ",
      paste(valid_batch_vars, collapse = ", "), " ..."
    ))
    
    batch_factor  <- factor(targets[[valid_batch_vars[1L]]])
    batch2_factor <- if (length(valid_batch_vars) >= 2L)
      factor(targets[[valid_batch_vars[2L]]]) else NULL
    
    # For 3+ batch variables we absorb them into the design matrix as additional
    # terms so that removeBatchEffect can remove their joint effect.
    extra_design <- design
    if (length(valid_batch_vars) >= 3L) {
      for (bv in valid_batch_vars[seq(3L, length(valid_batch_vars))]) {
        extra_design <- cbind(extra_design,
                              model.matrix(~ factor(targets[[bv]]) - 1))
      }
    }
    
    corrected_mat <- limma::removeBatchEffect(
      x        = mat,
      batch    = batch_factor,
      batch2   = batch2_factor,
      design   = extra_design
    )
  }
  
  # ── Save result ─────────────────────────────────────────────────────────────
  emit_progress(90, "Saving corrected dataset...")
  saveRDS(corrected_mat, file = file.path(job_dir, "corrected_data.rds"))
  
  emit_progress(100, "Batch correction pipeline finished successfully!")
  emit_done()
}

# ── CLI Execution Block ──────────────────────────────────────────────────────
is_main_script <- any(grepl("--file=.*batch_correct\\.R",
                            commandArgs(trailingOnly = FALSE)))

if (is_main_script) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 2L) {
    emit_error("Missing required CLI arguments: job_dir and batch_vars (comma-separated)")
  }
  
  job_dir        <- args[1L]
  batch_vars_str <- args[2L]
  covariates_str <- if (length(args) >= 3L) args[3L] else ""
  
  run_batch_correction(job_dir, batch_vars_str, covariates_str)
}
