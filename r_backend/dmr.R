#!/usr/bin/env Rscript
# r_backend/dmr.R
#
#' Differentially Methylated Region (DMR) analysis.
#'
#' Discovers genomic regions of coordinated methylation change between two groups
#' using ChAMP's Bumphunter implementation. The workflow loads a beta matrix,
#' aligns the sample-sheet metadata, picks the case/control groups, runs a fast
#' cluster pre-check, executes \code{champ.DMR}, and exports the regions as CSV
#' and RDS.
#'
#' @section Array support:
#' 450K, EPIC v1 and EPIC v2 are supported. The array type is supplied by the
#' caller (\code{arraytype}) and passed to ChAMP, which loads the matching
#' annotation internally. Aliases \code{EPIC}/\code{850K} are normalized to
#' \code{EPICv1}.
#'
#' @section Usage:
#' \code{Rscript dmr.R <sample_sheet_path> <job_dir> <beta_filename> \
#'   [minProbes] [cutoff] [adjPvalDmr] [maxGap] [arraytype] [nBootstraps] \
#'   [nCores] [group_column] [case_group] [control_group]}
#'
#' @section Significance policy:
#' \code{adjPvalDmr} is passed as 1.0 by the backend so ALL regions are returned;
#' significance is applied later as a table filter (consistent with TAB-01/DMP).
#'
#' @section Output:
#' \code{<job_dir>/dmr_results.csv} and \code{dmr_results.rds} with columns
#' \code{ID, N_DMPS, CHR, START, STOP, WIDTH, P_VALUE, MEANDIFF}.
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON.


# ── Environment setup ─────────────────────────────────────────────────────────
# Pin numerical backends to a single thread; DMR uses its own process-level
# parallelism (doParallel) on top of this.
Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")
Sys.setenv(NUMEXPR_NUM_THREADS = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")

suppressPackageStartupMessages({
  library(methods)
  library(DBI)
  library(RSQLite)
  library(lumi)
  library(ChAMP)
  library(readr)
  library(jsonlite)
  library(doParallel)
})

# Shared progress contract and sample-sheet helpers.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/samplesheet.R")


# ── Constants ─────────────────────────────────────────────────────────────────

#' Canonical output schema (column order) for the DMR results table.
DMR_OUTPUT_COLUMNS <- c("ID", "N_DMPS", "CHR", "START", "STOP", "WIDTH", "P_VALUE", "MEANDIFF")

#' Maps a canonical array type to its champ.DMR value and candidate
#' ChAMPdata \code{probe.features} dataset names (tried in order).
ARRAY_ANNOTATION <- list(
  "450K"   = list(champ = "450K",   datasets = c("probe.features")),
  "EPICv1" = list(champ = "EPICv1", datasets = c("probe.features.epicv1", "probe.features.epic")),
  "EPICv2" = list(champ = "EPICv2", datasets = c("probe.features.epicv2"))
)


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

#' Load and sanitize the beta matrix.
#'
#' Accepts a raw matrix or an S4 minfi object; clamps values to [0, 1].
#'
#' @param beta_path Path to the beta \code{.rds} file.
#' @return A numeric beta matrix (probes x samples).
load_beta_matrix <- function(beta_path) {
  if (!file.exists(beta_path)) {
    emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
  }
  beta <- tryCatch(
    readRDS(beta_path),
    error = function(e) emit_error(sprintf("Unable to read beta RDS '%s': %s", beta_path, conditionMessage(e)))
  )
  if (isS4(beta)) {
    suppressPackageStartupMessages(library(minfi))
    beta <- minfi::getBeta(beta)
  }
  if (!is.matrix(beta)) beta <- as.matrix(beta)
  storage.mode(beta) <- "numeric"

  if (nrow(beta) == 0L || ncol(beta) == 0L) {
    emit_error("Loaded beta matrix contains no features or samples (empty matrix)")
  }
  # Clamp to the valid methylation range.
  beta[beta < 0] <- 0
  beta[beta > 1] <- 1
  beta
}

#' Read the sample sheet and align it to the beta-matrix columns.
#'
#' Matches by \code{Sample_Name} or the combined \code{Array_ID}
#' (Sentrix_ID_Sentrix_Position) using normalized ids.
#'
#' @param sample_sheet_path Path to the sample sheet.
#' @param beta Beta matrix (probes x samples).
#' @param group_column The grouping column that must be present.
#' @return A data.frame aligned 1:1 to \code{colnames(beta)}.
load_aligned_samples <- function(sample_sheet_path, beta, group_column) {
  if (!file.exists(sample_sheet_path)) {
    emit_error(sprintf("Sample sheet file not found: %s", sample_sheet_path))
  }
  samples <- tryCatch(
    read_sample_sheet_smart(sample_sheet_path),
    error = function(e) emit_error(sprintf("Failed to parse sample sheet: %s", conditionMessage(e)))
  )

  if (!group_column %in% colnames(samples)) {
    emit_error(sprintf("Group column '%s' not found in sample sheet.", group_column))
  }
  if (!"Sample_Name" %in% colnames(samples)) {
    emit_error("Sample sheet is missing the required 'Sample_Name' column.")
  }
  if (any(is.na(samples$Sample_Name)) || any(is.na(samples[[group_column]]))) {
    emit_error("Sample sheet validation failed: missing values in 'Sample_Name' or the group column.")
  }

  if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(samples))) {
    samples$Array_ID <- sample_sheet_array_id(samples)
  } else {
    samples$Array_ID <- NA_character_
  }

  beta_ids <- normalize_id(colnames(beta))
  # Choose the identifier column that covers the beta columns.
  by_name <- mean(beta_ids %in% normalize_id(samples$Sample_Name))
  by_arr  <- mean(beta_ids %in% normalize_id(samples$Array_ID))
  id_col  <- if (by_name >= by_arr && by_name > 0) "Sample_Name"
             else if (by_arr > 0) "Array_ID"
             else NULL
  if (is.null(id_col)) {
    emit_error("Sample alignment failed: no matching identifiers between beta columns and sample sheet.")
  }

  sample_ids <- normalize_id(samples[[id_col]])
  match_idx  <- match(beta_ids, sample_ids)
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
#' When not given explicitly, requires the group column to contain exactly two
#' usable levels and uses them (sorted: first = control, second = case).
#'
#' @param group_vec Character vector of group labels (per sample).
#' @param group_column Name of the grouping column (for messages).
#' @param case_group,control_group Optional explicit labels.
#' @return A list with \code{case} and \code{control}.
resolve_groups <- function(group_vec, group_column, case_group, control_group) {
  if (!nzchar(case_group) || !nzchar(control_group)) {
    lv <- sort(unique(group_vec[!is.na(group_vec) & nzchar(group_vec)]))
    if (length(lv) != 2L) {
      emit_error(sprintf(
        "Column '%s' has %d usable groups; specify a case and a control group.",
        group_column, length(lv)
      ))
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

#' Reduce to the two chosen groups and build the phenotype factor.
#'
#' Control is the reference level so the region MEANDIFF carries a deterministic
#' Case - Control sign. A group with a single sample gets one synthetic near-copy
#' (tiny noise) so the region statistics can run; this is a degenerate-case
#' fallback and such results should be read with caution.
#'
#' @param beta Beta matrix (probes x samples).
#' @param group_vec Per-sample group labels (aligned to beta columns).
#' @param case_group,control_group Chosen group labels.
#' @return A list with the reduced \code{beta} and the \code{pheno} factor.
build_two_group_design <- function(beta, group_vec, case_group, control_group) {
  keep      <- group_vec %in% c(case_group, control_group)
  beta      <- beta[, keep, drop = FALSE]
  group_vec <- group_vec[keep]
  pheno     <- factor(group_vec, levels = c(control_group, case_group))

  if (nlevels(pheno) < 2L) {
    emit_error("At least two distinct groups are required for DMR analysis.")
  }

  for (g in levels(pheno)) {
    if (sum(pheno == g, na.rm = TRUE) == 1L) {
      idx <- which(pheno == g)[1]
      set.seed(42)
      new_col <- beta[, idx, drop = FALSE] + rnorm(nrow(beta), mean = 0, sd = 1e-7)
      new_col[new_col < 0] <- 0
      new_col[new_col > 1] <- 1
      colnames(new_col) <- paste0(colnames(beta)[idx], "_virtual_rep")
      beta  <- cbind(beta, new_col)
      pheno <- factor(c(as.character(pheno), g), levels = c(control_group, case_group))
    }
  }
  list(beta = beta, pheno = pheno)
}

#' Load the ChAMPdata probe annotation for an array type (best effort).
#'
#' @param arraytype Canonical array type.
#' @return The probe.features data.frame, or \code{NULL} if none could be loaded.
load_probe_features <- function(arraytype) {
  for (nm in ARRAY_ANNOTATION[[arraytype]]$datasets) {
    pf <- tryCatch({
      suppressWarnings(data(list = nm, envir = environment()))
      if (exists(nm, envir = environment())) get(nm, envir = environment()) else NULL
    }, error = function(e) NULL)
    if (!is.null(pf)) return(pf)
  }
  NULL
}

#' Count usable genomic clusters as a fast pre-check.
#'
#' @param beta Beta matrix.
#' @param pf probe.features annotation (or NULL to skip).
#' @param max_gap Maximum gap (bp) joining probes into a cluster.
#' @param min_probes Minimum probes per cluster.
#' @return Number of qualifying clusters, or \code{NA} when the check is skipped.
count_usable_clusters <- function(beta, pf, max_gap, min_probes) {
  if (is.null(pf)) return(NA_integer_)
  cpg_idx <- intersect(rownames(beta), rownames(pf))
  if (length(cpg_idx) == 0L) {
    emit_error("Genomic alignment error: no overlap between beta features and the probe annotation. The arraytype likely does not match the data.")
  }
  anno <- pf[cpg_idx, ]
  anno <- anno[order(anno$CHR, anno$MAPINFO), ]
  cl   <- bumphunter::clusterMaker(anno$CHR, anno$MAPINFO, maxGap = max_gap)
  sum(table(cl) >= min_probes)
}

#' Build the standardized DMR output data frame (handles the empty case).
#'
#' @param dmr_table Raw region table from champ.DMR (or NULL/0-row).
#' @return A data.frame with \code{DMR_OUTPUT_COLUMNS}.
build_dmr_output <- function(dmr_table) {
  empty <- data.frame(
    ID = character(0), N_DMPS = numeric(0), CHR = character(0),
    START = numeric(0), STOP = numeric(0), WIDTH = numeric(0),
    P_VALUE = numeric(0), MEANDIFF = numeric(0), stringsAsFactors = FALSE
  )
  if (is.null(dmr_table) || nrow(dmr_table) == 0L) return(empty)

  get_col <- function(df, candidates, fallback = NA_real_) {
    col <- intersect(candidates, colnames(df))[1]
    if (is.na(col)) fallback else df[[col]]
  }
  data.frame(
    ID       = paste0("DMR_", seq_len(nrow(dmr_table))),
    N_DMPS   = get_col(dmr_table, c("L", "nCpGs", "nprobes")),
    CHR      = get_col(dmr_table, c("seqnames", "chr")),
    START    = get_col(dmr_table, c("start")),
    STOP     = get_col(dmr_table, c("end")),
    WIDTH    = get_col(dmr_table, c("width")),
    P_VALUE  = get_col(dmr_table, c("p.valueArea", "p.value")),
    MEANDIFF = get_col(dmr_table, c("value", "meanDiff")),
    stringsAsFactors = FALSE
  )
}


# ── Argument parsing ──────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3L) {
  emit_error("Insufficient arguments. Expected: <sample_sheet_path> <job_dir> <beta_filename>")
}

sample_sheet_path <- args[1]
job_dir           <- args[2]
beta_input        <- args[3]
beta_path         <- if (file.exists(beta_input)) beta_input else file.path(job_dir, beta_input)

min_probes   <- if (length(args) >= 4) as.numeric(args[4]) else 3
cutoff_raw   <- if (length(args) >= 5) args[5] else "NULL"
cutoff       <- if (toupper(cutoff_raw) %in% c("NULL", "", "NA")) NULL else as.numeric(cutoff_raw)
adj_pval     <- if (length(args) >= 6) as.numeric(args[6]) else 0.05
max_gap      <- if (length(args) >= 7) as.numeric(args[7]) else 1000
array_type   <- normalize_arraytype(if (length(args) >= 8) args[8] else "EPICv2")
n_bootstraps <- if (length(args) >= 9) as.integer(args[9]) else 10L
n_cores      <- if (length(args) >= 10) as.integer(args[10]) else 1L

# Dynamic comparison (any column) + deterministic sign via the control reference.
group_column  <- if (length(args) >= 11 && nzchar(args[11])) args[11] else "Sample_Group"
case_group    <- if (length(args) >= 12 && nzchar(args[12])) args[12] else ""
control_group <- if (length(args) >= 13 && nzchar(args[13])) args[13] else ""

numeric_params <- c(min_probes, adj_pval, max_gap, n_bootstraps, n_cores)
if (!is.null(cutoff)) numeric_params <- c(numeric_params, cutoff)
if (any(is.na(numeric_params))) {
  emit_error("Parameter validation failed: non-numeric values detected in numerical arguments.")
}
if (n_bootstraps < 1L) emit_error("Configuration error: nBootstraps must be >= 1.")
if (n_cores < 1L)      emit_error("Configuration error: nCores must be >= 1.")
if (!dir.exists(job_dir)) dir.create(job_dir, recursive = TRUE)


# ── Main flow ─────────────────────────────────────────────────────────────────
emit_progress(0, "Initializing Differential Methylation Region (DMR) workflow")

# Parallel backend (fall back to sequential on any failure).
emit_progress(5, "Configuring parallel compute environment")
if (n_cores == 1L) {
  registerDoSEQ()
} else {
  ok <- tryCatch({
    n_actual <- min(n_cores, parallel::detectCores(logical = FALSE))
    cl_par   <- makeCluster(n_actual)
    registerDoParallel(cl_par)
    on.exit(stopCluster(cl_par), add = TRUE)
    TRUE
  }, error = function(e) FALSE)
  if (!isTRUE(ok)) {
    emit_progress(5, "Parallel setup failed; falling back to sequential processing.")
    registerDoSEQ()
  }
}

emit_progress(15, "Loading and validating methylation beta matrix")
beta <- load_beta_matrix(beta_path)

emit_progress(35, "Loading and aligning sample sheet metadata")
samples_aligned <- load_aligned_samples(sample_sheet_path, beta, group_column)

emit_progress(50, "Selecting case/control groups")
group_vec <- as.character(samples_aligned[[group_column]])
groups    <- resolve_groups(group_vec, group_column, case_group, control_group)
design    <- build_two_group_design(beta, group_vec, groups$case, groups$control)
beta      <- design$beta
pheno     <- design$pheno

emit_progress(65, "Validating genomic probe density and clusters")
pf            <- load_probe_features(array_type)
cluster_count <- tryCatch(
  count_usable_clusters(beta, pf, max_gap, min_probes),
  error = function(e) emit_error(sprintf("Cluster validation failed: %s", conditionMessage(e)))
)
if (identical(cluster_count, 0L)) {
  emit_error(sprintf(
    "No genomic probe clusters match the constraints (minProbes=%g, maxGap=%g bp). Consider relaxing the thresholds.",
    min_probes, max_gap
  ))
}
if (is.na(cluster_count)) {
  emit_progress(65, "Probe annotation unavailable for pre-check; relying on champ.DMR.")
}

emit_progress(75, "Executing region discovery (ChAMP Bumphunter)")
dmr_raw <- tryCatch(
  champ.DMR(
    beta       = beta,
    pheno      = pheno,
    arraytype  = ARRAY_ANNOTATION[[array_type]]$champ,
    method     = "Bumphunter",
    minProbes  = min_probes,
    cutoff     = cutoff,
    adjPvalDmr = adj_pval,
    maxGap     = max_gap,
    B          = n_bootstraps
  ),
  error = function(e) emit_error(sprintf("ChAMP DMR execution failed: %s", conditionMessage(e)))
)
if (is.null(dmr_raw)) emit_error("Analysis anomaly: champ.DMR returned NULL.")

dmr_table <- if (is.list(dmr_raw) && !is.data.frame(dmr_raw)) dmr_raw$BumphunterDMR else dmr_raw
no_significant_dmrs <- is.null(dmr_table) || nrow(dmr_table) == 0L

if (no_significant_dmrs) {
  # No DMRs passing the threshold is a valid scientific outcome, not an error:
  # emit a well-formed empty table and finish gracefully.
  emit_progress(90, sprintf("Analysis complete: no DMR regions pass the threshold (adjPvalDmr <= %g).", adj_pval))
} else {
  emit_progress(90, "Formatting genomic region metrics")
}
dmr_out <- build_dmr_output(dmr_table)

emit_progress(100, "Saving discovered DMR regions")
output_csv <- file.path(job_dir, "dmr_results.csv")
output_rds <- file.path(job_dir, "dmr_results.rds")
tryCatch({
  write.csv(dmr_out, output_csv, row.names = FALSE)
  saveRDS(dmr_out, output_rds)
}, error = function(e) emit_error(sprintf("Failed to save DMR results: %s", conditionMessage(e))))

emit_done(
  output_csv     = output_csv,
  output_rds     = output_rds,
  total_dmrs     = nrow(dmr_out),
  no_significant = no_significant_dmrs
)

quit(save = "no", status = 0)
