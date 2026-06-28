#!/usr/bin/env Rscript
# r_backend/batch_correct.R
#
#' Batch-effect correction step of the methylation-analysis pipeline.
#'
#' Removes one or more technical batch effects from the normalized beta matrix
#' using \code{limma::removeBatchEffect}, while protecting the chosen biological
#' variable(s) via the design matrix so their signal is preserved.
#'
#' The script is array-agnostic: it works on a numeric beta matrix (extracted
#' from any minfi object), so 450K, EPIC v1 and EPIC v2 data are all supported
#' without special handling. It also accepts ARBITRARY sample-sheet column names
#' — any column is selectable as a batch variable or covariate.
#'
#' @section Usage:
#' \code{Rscript batch_correct.R <job_dir> <batch_vars> [<covariates>]}
#' where \code{batch_vars} and \code{covariates} are comma-separated column names.
#'
#' @section Method:
#' \code{removeBatchEffect(x, batch, batch2, covariates, design)} preserves the
#' effects in \code{design} and removes the rest. We therefore map:
#' \itemize{
#'   \item biological covariates  -> \code{design}  (preserved)
#'   \item 1st batch variable     -> \code{batch}   (removed)
#'   \item 2nd batch variable     -> \code{batch2}  (removed)
#'   \item 3rd+ batch variables   -> \code{covariates} as dummy contrasts (removed)
#' }
#'
#' @section Output:
#' \code{<job_dir>/corrected_data.rds} — the corrected beta matrix (a plain
#' numeric matrix, as consumed by the downstream steps).
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON.

options(digits = 4)

# ── Environment setup ─────────────────────────────────────────────────────────
# Pin numerical backends to a single thread (removeBatchEffect uses BLAS via
# lm.fit); consistent with the other pipeline scripts and crash-safe.
Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")
Sys.setenv(NUMEXPR_NUM_THREADS = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")

# Shared progress contract and sample-sheet helpers. Must read the sheet the same
# way every other component does (raw [Data] column names) so the batch variable
# the API offers is exactly the one validated here.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/samplesheet.R")

if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
}


# ── Sample-sheet synchronization ──────────────────────────────────────────────

#' Align sample-sheet rows to the beta-matrix columns.
#'
#' Matches by the combined array id (Sentrix_ID_Sentrix_Position); if that fails,
#' falls back to \code{Sample_Name}; if that also fails, to positional order (with
#' a warning). Always returns exactly \code{ncol(mat)} rows in matrix order.
#'
#' @param mat A numeric beta matrix (probes x samples).
#' @param targets A data.frame from \code{read_sample_sheet_smart()}.
#' @return A data.frame of metadata aligned to \code{colnames(mat)}.
sync_samplesheet <- function(mat, targets) {
  mat_ids <- normalize_id(gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(colnames(mat))))

  # Attempt 1: combined array id.
  if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(targets))) {
    target_ids <- normalize_id(gsub("_Grn.*|_Red.*|\\.idat.*", "", sample_sheet_array_id(targets)))
    matches    <- match(mat_ids, target_ids)
    if (!any(is.na(matches)) && length(matches) == ncol(mat)) {
      return(targets[matches, , drop = FALSE])
    }
  }

  # Attempt 2: Sample_Name.
  if ("Sample_Name" %in% colnames(targets)) {
    matches <- match(mat_ids, normalize_id(targets$Sample_Name))
    if (!any(is.na(matches)) && length(matches) == ncol(mat)) {
      return(targets[matches, , drop = FALSE])
    }
  }

  # Fallback: positional order (assumes the sheet is in matrix-column order).
  if (nrow(targets) < ncol(mat)) {
    emit_error(sprintf(
      "Sample sheet has fewer rows (%d) than the data has samples (%d); cannot align.",
      nrow(targets), ncol(mat)
    ))
  }
  warning("Could not match sample ids; falling back to positional sample alignment.")
  targets[seq_len(ncol(mat)), , drop = FALSE]
}


# ── Column sanitation & model building ────────────────────────────────────────

#' Make a metadata column safe for use in a model matrix (no NAs, no dropped rows).
#'
#' Numeric columns keep their values (NAs mean-imputed); everything else becomes
#' a factor with empty/NA entries collapsed into an explicit \code{"NA"} level.
#' This guarantees the resulting design/batch vectors have one entry per sample,
#' so \code{removeBatchEffect} never silently drops samples.
#'
#' @param x A metadata column.
#' @return A numeric vector or a factor of the same length as \code{x}.
sanitize_model_column <- function(x) {
  if (is.numeric(x)) {
    if (any(is.na(x))) x[is.na(x)] <- mean(x, na.rm = TRUE)
    return(x)
  }
  x <- as.character(x)
  x[is.na(x) | !nzchar(trimws(x))] <- "NA"
  factor(x)
}

#' Validate biological covariates to protect.
#'
#' Keeps numeric columns with variance and categorical columns with at least two
#' but fewer than \code{n_samples} distinct values (id-like columns would
#' saturate the design and are dropped).
#'
#' @param targets Aligned metadata data.frame.
#' @param covariates_str Comma-separated covariate names.
#' @param n_samples Number of samples.
#' @return Character vector of valid covariate names (possibly empty).
validate_covariates <- function(targets, covariates_str, n_samples) {
  valid <- character(0)
  if (is.na(covariates_str) || !nzchar(trimws(covariates_str))) return(valid)

  for (cov in trimws(unlist(strsplit(covariates_str, ",")))) {
    if (!nzchar(cov) || !cov %in% colnames(targets)) next
    col      <- targets[[cov]]
    nonempty <- col[!is.na(col) & nzchar(trimws(as.character(col)))]
    n_dist   <- length(unique(as.character(nonempty)))

    if (n_dist < 2L) {
      emit_progress(52, paste0("Info: Ignoring covariate '", cov, "' (single level)."))
      next
    }
    if (!is.numeric(col) && n_dist >= n_samples) {
      emit_progress(52, paste0("Info: Ignoring covariate '", cov, "' (one level per sample)."))
      next
    }
    valid <- c(valid, cov)
  }
  valid
}

#' Validate batch variables to remove.
#'
#' A batch variable must exist and have at least two but fewer than
#' \code{n_samples} distinct levels (a variable with one level per sample is
#' fully confounded and cannot be corrected).
#'
#' @param targets Aligned metadata data.frame.
#' @param batch_vars Character vector of requested batch variable names.
#' @param n_samples Number of samples.
#' @return Character vector of valid batch variable names (possibly empty).
validate_batch_vars <- function(targets, batch_vars, n_samples) {
  valid <- character(0)
  for (bv in batch_vars) {
    if (!bv %in% colnames(targets)) {
      emit_progress(55, paste0("Warning: Batch variable '", bv, "' not found – skipping."))
      next
    }
    n_dist <- length(unique(as.character(targets[[bv]])))
    if (n_dist < 2L) {
      emit_progress(55, paste0("Warning: Batch variable '", bv, "' has only one level – skipping."))
      next
    }
    if (n_dist >= n_samples) {
      emit_progress(55, paste0("Warning: Batch variable '", bv,
                               "' has one level per sample (fully confounded) – skipping."))
      next
    }
    valid <- c(valid, bv)
  }
  valid
}

#' Build the design matrix of biological effects to PRESERVE.
#'
#' @param targets Aligned metadata data.frame.
#' @param covariates Character vector of covariate column names.
#' @return A model matrix (intercept-only when no covariates are given).
build_design <- function(targets, covariates) {
  if (length(covariates) == 0L) {
    return(model.matrix(~ 1, data = targets))
  }
  df <- as.data.frame(lapply(targets[, covariates, drop = FALSE], sanitize_model_column))
  colnames(df) <- covariates
  # Backtick-quote names so columns with spaces/special characters are valid in
  # the formula.
  rhs <- paste(sprintf("`%s`", covariates), collapse = " + ")
  model.matrix(as.formula(paste("~", rhs)), data = df)
}

#' Build a numeric covariate matrix (dummy contrasts) for extra batch variables.
#'
#' Used for the 3rd and further batch variables, which removeBatchEffect can only
#' remove via its \code{covariates} argument (it has just \code{batch}/
#' \code{batch2}). Each factor contributes its (k-1) treatment-contrast columns.
#'
#' @param targets Aligned metadata data.frame.
#' @param batch_vars_extra Character vector of the 3rd+ batch variable names.
#' @return A numeric matrix, or \code{NULL} when there are none.
build_extra_batch_covariates <- function(targets, batch_vars_extra) {
  if (length(batch_vars_extra) == 0L) return(NULL)
  mats <- lapply(batch_vars_extra, function(bv) {
    mm <- model.matrix(~ sanitize_model_column(targets[[bv]]))
    mm[, -1, drop = FALSE]  # drop the intercept -> contrast columns only
  })
  do.call(cbind, mats)
}


# ── Main correction pipeline ──────────────────────────────────────────────────

#' Run the batch-effect correction pipeline.
#'
#' @param job_dir Job directory (holds \code{normalized_data.rds} and the
#'   SampleSheet CSV; receives \code{corrected_data.rds}).
#' @param batch_vars_str Comma-separated batch variable names (e.g.
#'   "Sentrix_ID,Sentrix_Position").
#' @param covariates_str Comma-separated biological covariates to protect.
#' @return Invisibly \code{NULL}. Writes \code{corrected_data.rds}.
run_batch_correction <- function(job_dir, batch_vars_str, covariates_str = "") {

  emit_progress(0, "Script initialized – starting batch correction")

  emit_progress(10, "Loading Bioconductor packages (limma & minfi)...")
  suppressPackageStartupMessages({
    library(limma)
    library(minfi)
  })

  # ── Load sample sheet ───────────────────────────────────────────────────────
  emit_progress(20, "Locating sample sheet and importing files...")
  csv_files <- list.files(job_dir, pattern = ".*SampleSheet.*\\.csv$", full.names = TRUE)
  if (length(csv_files) == 0L) {
    emit_error("Sample sheet not found in job directory.")
  }
  targets <- tryCatch(
    read_sample_sheet_smart(csv_files[1]),
    error = function(e) emit_error(paste("Failed to read sample sheet:", conditionMessage(e)))
  )

  # ── Load normalized data ────────────────────────────────────────────────────
  data_path <- file.path(job_dir, "normalized_data.rds")
  if (!file.exists(data_path)) {
    emit_error("normalized_data.rds is missing. Run the normalization step first.")
  }
  data_obj <- tryCatch(
    readRDS(data_path),
    error = function(e) emit_error(paste("Could not read normalized_data.rds:", conditionMessage(e)))
  )

  if (is(data_obj, "RGChannelSet") || is(data_obj, "RGChannelSetExtended")) {
    emit_progress(30, "Raw data object detected. Extracting methylation channels...")
    data_obj <- minfi::preprocessRaw(data_obj)
  }
  if (is(data_obj, "MethylSet") || is(data_obj, "GenomicMethylSet") ||
      is(data_obj, "RatioSet")  || is(data_obj, "GenomicRatioSet")) {
    mat <- minfi::getBeta(data_obj)
  } else {
    mat <- as.matrix(data_obj)
  }
  storage.mode(mat) <- "numeric"

  # ── Condition the matrix ────────────────────────────────────────────────────
  emit_progress(40, "Conditioning data matrix (removing NA and zero-variance probes)...")
  mat <- mat[stats::complete.cases(mat), , drop = FALSE]
  row_var <- if (requireNamespace("matrixStats", quietly = TRUE)) {
    matrixStats::rowVars(mat)
  } else {
    apply(mat, 1, var)
  }
  mat <- mat[is.finite(row_var) & row_var > 0, , drop = FALSE]
  if (nrow(mat) == 0L || ncol(mat) < 2L) {
    emit_error("Not enough informative probes/samples remain for batch correction.")
  }

  # ── Align sample sheet ──────────────────────────────────────────────────────
  emit_progress(45, "Synchronizing sample sheet with data columns...")
  targets   <- sync_samplesheet(mat, targets)
  n_samples <- ncol(mat)

  # ── Biological covariates (protected via the design) ────────────────────────
  emit_progress(50, "Validating design-matrix covariates...")
  valid_covariates <- validate_covariates(targets, covariates_str, n_samples)
  design <- tryCatch(
    build_design(targets, valid_covariates),
    error = function(e) emit_error(paste("Failed to build design matrix:", conditionMessage(e)))
  )

  # ── Batch variables (removed) ───────────────────────────────────────────────
  emit_progress(55, "Validating batch variables...")
  batch_vars <- trimws(unlist(strsplit(batch_vars_str, ",")))
  batch_vars <- batch_vars[nzchar(batch_vars)]
  if (length(batch_vars) == 0L) {
    emit_error("No batch variables provided. Pass at least one via the second argument.")
  }

  valid_batch_vars <- validate_batch_vars(targets, batch_vars, n_samples)
  if (length(valid_batch_vars) == 0L) {
    # Returning the uncorrected matrix would let the job report success while
    # nothing was corrected — fail loudly instead (executor maps this to FAILED).
    emit_error(paste0(
      "No valid batch variables remain after validation: '",
      paste(batch_vars, collapse = "', '"),
      "'. They do not exist in the sample sheet, have only a single level, or one ",
      "level per sample. No correction was applied."
    ))
  }

  # ── Map batch variables to removeBatchEffect arguments ──────────────────────
  emit_progress(60, paste0(
    "Executing limma::removeBatchEffect for batch variable(s): ",
    paste(valid_batch_vars, collapse = ", "), " ..."
  ))

  batch_factor  <- sanitize_model_column(targets[[valid_batch_vars[1L]]])
  batch2_factor <- if (length(valid_batch_vars) >= 2L) {
    sanitize_model_column(targets[[valid_batch_vars[2L]]])
  } else {
    NULL
  }
  # 3rd+ batch variables are removed via the covariates argument (NOT the design,
  # which is preserved). This was the key correctness fix.
  extra_covariates <- if (length(valid_batch_vars) >= 3L) {
    build_extra_batch_covariates(targets, valid_batch_vars[seq(3L, length(valid_batch_vars))])
  } else {
    NULL
  }

  corrected_mat <- tryCatch(
    limma::removeBatchEffect(
      x          = mat,
      batch      = batch_factor,
      batch2     = batch2_factor,
      covariates = extra_covariates,
      design     = design
    ),
    error = function(e) emit_error(paste("Batch correction (removeBatchEffect) failed:", conditionMessage(e)))
  )

  if (all(is.na(corrected_mat))) {
    emit_error("Batch correction produced only NA values — the batch variable(s) are likely fully confounded with the protected design.")
  }

  # ── Save result ─────────────────────────────────────────────────────────────
  emit_progress(90, "Saving corrected dataset...")
  out_path <- file.path(job_dir, "corrected_data.rds")
  tryCatch(
    saveRDS(corrected_mat, file = out_path),
    error = function(e) emit_error(paste("Could not save corrected data:", conditionMessage(e)))
  )
  if (!file.exists(out_path)) {
    emit_error("Corrected data file was not created.")
  }

  emit_progress(100, "Batch correction pipeline finished successfully!")
  emit_done()
  invisible(NULL)
}


# ── CLI execution block ───────────────────────────────────────────────────────
# Guarded so the functions can be sourced (e.g. in tests) without side effects.
is_main_script <- any(grepl("--file=.*batch_correct\\.R", commandArgs(trailingOnly = FALSE)))

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
