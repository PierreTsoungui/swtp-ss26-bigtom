#!/usr/bin/env Rscript
# r_backend/dmp.R
#
#' Differentially Methylated Probe (DMP) analysis.
#'
#' Tests every CpG for differential methylation between two groups using
#' ChAMP's \code{champ.DMP}. The effect size (Delta Beta) is computed
#' deterministically from the beta matrix as mean(case) - mean(control), so the
#' sign is well-defined regardless of ChAMP's internal contrast direction.
#'
#' @section Array support:
#' 450K, EPIC v1 and EPIC v2 are supported. The array type is supplied by the
#' caller and passed to ChAMP, which loads the matching annotation internally.
#' Aliases \code{EPIC}/\code{850K} are normalized to \code{EPICv1}.
#'
#' @section Significance policy:
#' ChAMP runs with \code{adjPVal = 1} so ALL probes are returned; significance is
#' applied later as a table filter (TAB-01, consistent with dmr.R). The
#' \code{adjPVal} CLI argument is kept only for backward compatibility/logging.
#'
#' @section Usage:
#' \code{Rscript dmp.R <sample_sheet.csv> <job_dir> <beta.rds> [adjPVal] \
#'   [arraytype] [group_column] [case_group] [control_group]}
#'
#' @section Output:
#' \code{<job_dir>/dmp_results.csv} and \code{dmp_results.rds} with columns
#' \code{ID, CHR, POS, GENE, FEATURE, CGI, ADJ_P, GROUP1_AVG, GROUP2_AVG,
#' DELTA_BETA, LOG_FC, DMR_ID}.
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON.


# ── Environment setup ─────────────────────────────────────────────────────────
# Pin numerical backends to a single thread (champ.DMP uses limma/BLAS).
Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")
Sys.setenv(NUMEXPR_NUM_THREADS = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")

suppressPackageStartupMessages({
  library(ChAMP)
  library(readr)
  library(jsonlite)
})

# Shared progress contract and sample-sheet helpers.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/samplesheet.R")

if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
}


# ── Helpers ───────────────────────────────────────────────────────────────────

#' Normalize an array-type string to the canonical set.
#'
#' @param x Raw array-type argument.
#' @return One of "450K", "EPICv1", "EPICv2"; emits a fatal error otherwise.
normalize_arraytype <- function(x) {
  x <- toupper(trimws(x))
  if (x %in% c("EPIC", "850K", "EPICV1")) return("EPICv1")
  if (x == "EPICV2") return("EPICv2")
  if (x == "450K")   return("450K")
  emit_error(sprintf("Invalid arraytype: '%s'. Allowed: 450K, EPICv1 (EPIC), EPICv2.", x))
}

#' Case-insensitive, candidate-based column accessor.
#'
#' ChAMP output column names vary slightly across array annotations; try several
#' candidates so the script is robust for 450K/EPIC v1/EPIC v2.
#'
#' @param df A data.frame.
#' @param candidates Candidate column names (in priority order).
#' @param fallback Value returned when none match.
#' @return The matching column, or \code{fallback}.
get_col <- function(df, candidates, fallback = NA) {
  hit <- candidates[candidates %in% colnames(df)]
  if (length(hit) > 0) return(df[[hit[1]]])
  ci <- match(tolower(candidates), tolower(colnames(df)))
  ci <- ci[!is.na(ci)]
  if (length(ci) > 0) return(df[[ci[1]]])
  fallback
}

#' Load, validate and clean the beta matrix.
#'
#' Accepts a raw matrix or an S4 minfi object; clamps to [0, 1]; drops probes
#' that are non-finite or invariant (no methylation variance carries no DM
#' signal and would destabilise the model).
#'
#' @param beta_path Path to the beta \code{.rds} file.
#' @return A cleaned numeric beta matrix (probes x samples).
load_beta_matrix <- function(beta_path) {
  if (!file.exists(beta_path)) {
    emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
  }
  beta <- tryCatch(
    readRDS(beta_path),
    error = function(e) emit_error(sprintf("Failed to load beta matrix '%s': %s", beta_path, conditionMessage(e)))
  )
  if (isS4(beta)) {
    suppressPackageStartupMessages(library(minfi))
    beta <- minfi::getBeta(beta)
  }
  beta <- as.matrix(beta)
  storage.mode(beta) <- "numeric"

  if (nrow(beta) == 0L || ncol(beta) == 0L) {
    emit_error("Loaded beta matrix is empty (0 features or 0 samples).")
  }

  # Clamp finite values into the valid methylation range.
  beta[is.finite(beta) & beta < 0] <- 0
  beta[is.finite(beta) & beta > 1] <- 1

  # Keep only all-finite, variable probes (instead of failing on a single NA).
  finite_rows <- rowSums(!is.finite(beta)) == 0L
  row_sds <- if (requireNamespace("matrixStats", quietly = TRUE)) {
    matrixStats::rowSds(beta)
  } else {
    apply(beta, 1, sd)
  }
  keep <- finite_rows & is.finite(row_sds) & row_sds > 1e-5
  beta <- beta[keep, , drop = FALSE]

  if (nrow(beta) == 0L) {
    emit_error("No valid probes remain after removing non-finite and invariant rows.")
  }
  beta
}

#' Read the sample sheet and align it to the beta-matrix columns.
#'
#' @param sample_sheet_path Path to the sample sheet.
#' @param beta Beta matrix (probes x samples).
#' @param group_column Grouping column that must be present.
#' @return A data.frame aligned 1:1 to \code{colnames(beta)}.
load_aligned_samples <- function(sample_sheet_path, beta, group_column) {
  if (!file.exists(sample_sheet_path)) {
    emit_error(sprintf("Sample sheet file not found at path: %s", sample_sheet_path))
  }
  samples <- tryCatch(
    read_sample_sheet_smart(sample_sheet_path),
    error = function(e) emit_error(sprintf("Failed to parse sample sheet: %s", conditionMessage(e)))
  )

  if (!"Sample_Name" %in% colnames(samples)) {
    emit_error("Sample sheet is missing the required 'Sample_Name' column.")
  }
  if (!group_column %in% colnames(samples)) {
    emit_error(sprintf("Group column '%s' not found in sample sheet.", group_column))
  }
  if (anyDuplicated(samples$Sample_Name)) {
    emit_error("Sample sheet contains duplicate Sample_Name values.")
  }
  if (any(is.na(samples[[group_column]]))) {
    emit_error(sprintf("Group column '%s' contains missing values.", group_column))
  }

  if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(samples))) {
    samples$Array_ID <- sample_sheet_array_id(samples)
  } else {
    samples$Array_ID <- NA_character_
  }

  beta_ids <- normalize_id(colnames(beta))
  by_name  <- mean(beta_ids %in% normalize_id(samples$Sample_Name))
  by_arr   <- mean(beta_ids %in% normalize_id(samples$Array_ID))
  id_col   <- if (by_name >= by_arr && by_name > 0) "Sample_Name"
              else if (by_arr > 0) "Array_ID"
              else NULL
  if (is.null(id_col)) {
    emit_error("Sample alignment failed: no matching identifiers between beta columns and sample sheet.")
  }

  match_idx <- match(beta_ids, normalize_id(samples[[id_col]]))
  if (any(is.na(match_idx))) {
    emit_error("Sample alignment failed: some beta-matrix columns have no sample-sheet entry.")
  }
  aligned <- samples[match_idx, , drop = FALSE]
  if (nrow(aligned) != ncol(beta)) {
    emit_error("Sample alignment mismatch: aligned sample count does not match beta columns.")
  }
  aligned
}

#' Resolve the case and control group labels.
#'
#' @param group_vec Per-sample group labels.
#' @param group_column Grouping column name (for messages).
#' @param case_group,control_group Optional explicit labels.
#' @return A list with \code{case} and \code{control}.
resolve_groups <- function(group_vec, group_column, case_group, control_group) {
  if (!nzchar(case_group) || !nzchar(control_group)) {
    lv <- sort(unique(group_vec[!is.na(group_vec) & nzchar(group_vec)]))
    if (length(lv) != 2L) {
      emit_error(sprintf("Column '%s' has %d usable groups; specify a case and a control group.",
                         group_column, length(lv)))
    }
    control_group <- lv[1]
    case_group    <- lv[2]
  }
  if (case_group == control_group) emit_error("Case and control group must be different.")
  if (!(case_group %in% group_vec) || !(control_group %in% group_vec)) {
    emit_error(sprintf("Case ('%s') or control ('%s') not present in column '%s'.",
                       case_group, control_group, group_column))
  }
  list(case = case_group, control = control_group)
}

#' Assemble the standardized DMP result table.
#'
#' Group means and Delta Beta are computed directly from the beta matrix
#' (case - control) so the effect-size sign is deterministic.
#'
#' @param dmp_table ChAMP DMP result table (probes x stats), rownames = CpG ids.
#' @param beta Beta matrix reduced to the two groups.
#' @param pheno Phenotype factor (levels = control, case).
#' @param case_group,control_group Group labels.
#' @return A data.frame with the canonical DMP output columns.
build_dmp_output <- function(dmp_table, beta, pheno, case_group, control_group) {
  p_col <- get_col(dmp_table, c("adj.P.Val", "adj.p.val", "P.Value", "p.value"), fallback = NULL)
  if (is.null(p_col)) {
    emit_error("DMP result table has no recognizable p-value column.")
  }

  ids       <- rownames(dmp_table)
  case_mean <- rowMeans(beta[, pheno == case_group,    drop = FALSE], na.rm = TRUE)
  ctrl_mean <- rowMeans(beta[, pheno == control_group, drop = FALSE], na.rm = TRUE)
  g1 <- unname(case_mean[ids])   # Case
  g2 <- unname(ctrl_mean[ids])   # Control

  eps <- 1e-8
  data.frame(
    ID         = ids,
    CHR        = as.character(get_col(dmp_table, c("CHR", "chr"))),
    POS        = get_col(dmp_table, c("MAPINFO", "pos", "POS")),
    GENE       = as.character(get_col(dmp_table, c("gene", "Gene"), fallback = "")),
    FEATURE    = as.character(get_col(dmp_table, c("feature", "Feature"), fallback = "")),
    CGI        = as.character(get_col(dmp_table, c("cgi", "CGI"), fallback = "")),
    ADJ_P      = p_col,
    GROUP1_AVG = g1,
    GROUP2_AVG = g2,
    DELTA_BETA = g1 - g2,
    LOG_FC     = log2((g1 + eps) / (g2 + eps)),
    DMR_ID     = "-",
    stringsAsFactors = FALSE
  )
}

#' Annotate each DMP with the DMR region it falls into (if any).
#'
#' Iterates over the (few) DMR regions and marks contained CpGs vectorially —
#' O(#regions) rather than O(#CpGs x #regions), which matters because ALL probes
#' are retained (TAB-01).
#'
#' @param dmp_df The DMP output data.frame (has CHR, POS, DMR_ID).
#' @param job_dir Job directory (may contain \code{dmr_results.rds}).
#' @return \code{dmp_df} with \code{DMR_ID} filled where regions overlap.
link_dmrs <- function(dmp_df, job_dir) {
  dmr_rds_path <- file.path(job_dir, "dmr_results.rds")
  if (!file.exists(dmr_rds_path)) return(dmp_df)

  dmr_data <- tryCatch(
    readRDS(dmr_rds_path),
    error = function(e) emit_error(sprintf("Failed to load DMR results '%s': %s", dmr_rds_path, conditionMessage(e)))
  )
  if (is.null(dmr_data) || nrow(dmr_data) == 0L) return(dmp_df)

  chr_v <- as.character(dmp_df$CHR)
  pos_v <- as.numeric(dmp_df$POS)
  for (j in seq_len(nrow(dmr_data))) {
    in_region <- chr_v == as.character(dmr_data$CHR[j]) &
                 pos_v >= as.numeric(dmr_data$START[j]) &
                 pos_v <= as.numeric(dmr_data$STOP[j])
    in_region[is.na(in_region)] <- FALSE
    dmp_df$DMR_ID[in_region] <- as.character(dmr_data$ID[j])
  }
  dmp_df
}


# ── Argument parsing ──────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3L) {
  emit_error("Insufficient arguments. Expected: <sample_sheet_path> <job_dir> <beta_filename>")
}

sample_sheet_path <- args[1]
job_dir           <- args[2]
beta_filename     <- args[3]
beta_path         <- if (file.exists(beta_filename)) beta_filename else file.path(job_dir, beta_filename)

# Kept for compatibility/logging only; significance is a downstream table filter.
adjPVal    <- if (length(args) >= 4) as.numeric(args[4]) else 1.0
arraytype  <- normalize_arraytype(if (length(args) >= 5) args[5] else "EPICv2")

# Dynamic comparison: any grouping column, explicit case/control. Delta Beta is
# then deterministic: mean(case) - mean(control) (TAB-02).
group_column  <- if (length(args) >= 6 && nzchar(args[6])) args[6] else "Sample_Group"
case_group    <- if (length(args) >= 7 && nzchar(args[7])) args[7] else ""
control_group <- if (length(args) >= 8 && nzchar(args[8])) args[8] else ""

if (!dir.exists(job_dir)) dir.create(job_dir, recursive = TRUE)


# ── Main flow ─────────────────────────────────────────────────────────────────
emit_progress(0, "Initializing Differential Methylation Probe (DMP) workflow")

emit_progress(15, "Loading and validating methylation beta matrix")
beta <- load_beta_matrix(beta_path)

emit_progress(35, "Loading and aligning sample sheet metadata")
samples_aligned <- load_aligned_samples(sample_sheet_path, beta, group_column)

emit_progress(55, "Selecting case/control groups")
group_vec <- as.character(samples_aligned[[group_column]])
groups    <- resolve_groups(group_vec, group_column, case_group, control_group)
case_group    <- groups$case
control_group <- groups$control

# Reduce to the two chosen groups; control is the reference level so
# Delta Beta = mean(Case) - mean(Control).
keep      <- group_vec %in% c(case_group, control_group)
beta      <- beta[, keep, drop = FALSE]
pheno     <- factor(group_vec[keep], levels = c(control_group, case_group))

# A differential test needs >= 2 samples per group; fabricating a replicate
# would yield statistically invalid p-values, so fail clearly instead.
group_sizes <- table(pheno)
if (any(group_sizes < 2L)) {
  emit_error(paste0(
    "DMP analysis requires at least two samples per group. Found: ",
    paste(names(group_sizes), as.integer(group_sizes), sep = "=", collapse = ", ")
  ))
}

emit_progress(75, "Executing statistical differential methylation test (champ.DMP)")
# adjPVal = 1 keeps ALL probes; significance is applied downstream (TAB-01).
dmp_raw <- tryCatch(
  champ.DMP(beta = beta, pheno = pheno, adjPVal = 1, arraytype = arraytype),
  error = function(e) emit_error(sprintf("ChAMP DMP execution failed: %s", conditionMessage(e)))
)
if (is.null(dmp_raw) || length(dmp_raw) == 0L) {
  emit_error("Analysis anomaly: champ.DMP returned an empty result object.")
}

emit_progress(85, "Extracting statistical contrasts and computing metrics")
dmp_table <- dmp_raw[[1]]
if (is.null(dmp_table) || nrow(dmp_table) == 0L) {
  emit_error("DMP extraction failed: result table is empty. Verify that the arraytype matches the data.")
}

dmp_out <- build_dmp_output(dmp_table, beta, pheno, case_group, control_group)

# Keep ALL probes; only drop rows with no computable group means. An
# empty table is a valid outcome (handled downstream / by the table filter).
dmp_out <- dmp_out[!is.na(dmp_out$GROUP1_AVG) & !is.na(dmp_out$GROUP2_AVG), , drop = FALSE]

emit_progress(95, "Overlapping DMPs with DMR region coordinates")
dmp_out <- link_dmrs(dmp_out, job_dir)

emit_progress(100, "Saving computed DMP results")
output_csv <- file.path(job_dir, "dmp_results.csv")
output_rds <- file.path(job_dir, "dmp_results.rds")
tryCatch({
  write.csv(dmp_out, output_csv, row.names = FALSE)
  saveRDS(dmp_out, output_rds)
}, error = function(e) emit_error(sprintf("Failed to save DMP results: %s", conditionMessage(e))))

emit_done(
  output_csv = output_csv,
  output_rds = output_rds,
  total_dmps = nrow(dmp_out)
)

quit(save = "no", status = 0)
