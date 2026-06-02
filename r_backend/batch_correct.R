#!/usr/bin/env Rscript
options(digits = 4)

# ── Progress Vertrag einbinden ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")

# ── Data Synchronization ─────────────────────────────────────────────────────

#' Synchronizes samplesheet targets with matrix columns.
#'
#' Aligns the order of samplesheet rows to match the matrix columns based on 
#' extracted Sentrix IDs (Slide_Array) from filenames or column identifiers.
#'
#' @param mat A numeric beta-value matrix.
#' @param targets A data.frame containing the sample sheet information.
#'
#' @return A data.frame containing aligned samplesheet metadata.
#' @export
sync_samplesheet <- function(mat, targets) {
  targets_ids <- paste0(targets$Slide, "_", targets$Array)
  clean_mat_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(colnames(mat)))
  clean_targets_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(targets_ids))
  matches <- match(clean_mat_ids, clean_targets_ids)

  # Biologischer Fallback: Verhindert Pipeline-Abstürze bei unvollständigen Mappings
  if (any(is.na(matches)) || length(matches) != ncol(mat)) {
    return(targets[1:ncol(mat), , drop = FALSE])
  } else {
    return(targets[matches, , drop = FALSE])
  }
}

# ── Covariate Validation ─────────────────────────────────────────────────────

#' Validates and filters covariates based on variance levels.
#'
#' Ensures that each requested covariate exists in the samplesheet and exhibits
#' at least 2 distinct levels to prevent linear dependency issues in ComBat.
#'
#' @param targets A data.frame containing aligned samplesheet metadata.
#' @param covariates_str A comma-separated string listing requested covariates.
#'
#' @return A character vector of valid covariates.
#' @export
validate_covariates <- function(targets, covariates_str) {
  valid_covariates <- c()

  if (covariates_str != "" && !is.na(covariates_str)) {
    cov_list <- unlist(strsplit(covariates_str, ","))
    for (cov in cov_list) {
      cov <- trimws(cov)
      if (cov %in% colnames(targets)) {
        distinct_levels <- length(unique(targets[[cov]]))
        # ComBat Design-Matrizen erfordern mindestens 2 Level, um mathematische Sättigung zu vermeiden
        if (distinct_levels >= 2) {
          valid_covariates <- c(valid_covariates, cov)
        } else {
          emit_progress(52, paste0("Info: Ignoring '", cov, "' due to single-level variance."))
        }
      }
    }
  }
  return(valid_covariates)
}

# ── Main Correction Pipeline ─────────────────────────────────────────────────

#' Runs the primary ComBat batch effect correction pipeline.
#'
#' Loads DNA methylation datasets, validates sample confounding factors, 
#' applies the ComBat empirical Bayes framework, and stores the processed RDS file.
#'
#' @param job_dir Character string indicating the target job directory path.
#' @param batch_var Character string denoting the metadata column for batch tracking.
#' @param covariates_str Character string hosting comma-separated model covariates.
#'
#' @return None (Saves corrected data as RDS).
#' @export
run_batch_correction <- function(job_dir, batch_var, covariates_str = "") {

  emit_progress(0, "Script initialized - Start Batch-Correction")

  emit_progress(10, "Loading Bioconductor packages (sva & minfi)...")
  suppressPackageStartupMessages({
    library(sva)
    library(minfi)
  })

  emit_progress(20, "Locating sample sheet and importing files...")
  csv_files <- list.files(job_dir, pattern = ".*SampleSheet.*\\.csv$", full.names = TRUE)
  if (length(csv_files) == 0) {
    emit_error("Samplesheet not found")
  }
  targets <- minfi::read.metharray.sheet(job_dir, pattern = ".*SampleSheet.*\\.csv$")

  data_path <- file.path(job_dir, "normalized_data.rds")
  if (!file.exists(data_path)) {
    emit_error("normalized_data.rds is missing")
  }
  data_obj <- readRDS(data_path)

  if (is(data_obj, "RGChannelSet") || is(data_obj, "RGChannelSetExtended")) {
    emit_progress(30, "Raw data object detected. Extrapolating channels...")
    data_obj <- minfi::preprocessRaw(data_obj)
  }

  if (is(data_obj, "MethylSet") || is(data_obj, "GenomicMethylSet") || 
    is(data_obj, "RatioSet") || is(data_obj, "GenomicRatioSet")) {
    mat <- minfi::getBeta(data_obj)
  } else {
    mat <- as.matrix(data_obj)
  }

  emit_progress(40, "Conditioning data matrix for ComBat...")
  mat <- na.omit(mat)
  row_vars <- apply(mat, 1, var)
  # Behalte nur Sonden mit echter Varianz (>0), da ComBat sonst durch Null-Teilung crasht
  mat <- mat[row_vars > 0, ]

  emit_progress(45, "Synchronizing samplesheet mapping...")
  targets <- sync_samplesheet(mat, targets)

  emit_progress(50, "Validating design matrix covariates...")
  valid_covariates <- validate_covariates(targets, covariates_str)

  if (length(valid_covariates) > 0) {
    formula_str <- paste("~", paste(valid_covariates, collapse = " + "))
    mod <- model.matrix(as.formula(formula_str), data = targets)
  } else {
    mod <- model.matrix(~1, data = targets)
  }

  batch_vector <- targets[[batch_var]]
  distinct_batches <- length(unique(batch_vector))

  if (distinct_batches < 2) {
    emit_progress(60, "Warning: Single batch variance detected. Skipping ComBat framework...")
    corrected_mat <- mat
  } else {
    emit_progress(60, "Executing empirical Bayes ComBat batch correction...")
    corrected_mat <- sva::ComBat(dat = mat, batch = batch_vector, mod = mod, par.prior = TRUE)
  }

  emit_progress(90, "Saving corrected dataset...")
  saveRDS(corrected_mat, file = file.path(job_dir, "corrected_data.rds"))

  # Finale Erfolgsmeldung und anschließendes Done-Signal an das Backend senden
  emit_progress(100, "Batch correction pipeline finished successfully!")
  emit_done()
}

# ── CLI Execution Block ──────────────────────────────────────────────────────
is_main_script <- any(grepl("--file=.*batch_correct\\.R", commandArgs(trailingOnly = FALSE)))

if (is_main_script) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 2) {
    emit_error("Missing required CLI arguments: job_dir and batch_var")
  }

  job_dir <- args[1]
  batch_var <- args[2]
  covariates_str <- if (length(args) >= 3) args[3] else ""

  run_batch_correction(job_dir, batch_var, covariates_str)
}