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
# Single-threaded, serial, reproducible execution (see utils/runtime.R). DMR
# adds its own process-level parallelism (doParallel) on top of this.
source("/app/r_backend/utils/runtime.R")
configure_runtime()

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

# Shared progress contract, sample-sheet, array-type and column helpers.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/samplesheet.R")
source("/app/r_backend/utils/arraytype.R")
source("/app/r_backend/utils/columns.R")
source("/app/r_backend/utils/beta.R")


# ── Constants ─────────────────────────────────────────────────────────────────

#' Canonical output schema (column order) for the DMR results table.
DMR_OUTPUT_COLUMNS <- c("ID", "N_DMPS", "CHR", "START", "STOP", "WIDTH", "P_VALUE", "MEANDIFF")


# ── Helpers ───────────────────────────────────────────────────────────────────
# normalize_arraytype() / read_array_type()       -> utils/arraytype.R
# champ_arraytype() / load_probe_features() /
#   ensure_probe_features()                        -> utils/arraytype.R
# pick_col()                                       -> utils/columns.R
# load_beta_matrix() / clamp_beta()              -> utils/beta.R

# load_aligned_samples()/align_samples_to_matrix() and resolve_case_control()
# are provided by utils/samplesheet.R.

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
  keep <- group_vec %in% c(case_group, control_group)
  beta <- beta[, keep, drop = FALSE]
  group_vec <- group_vec[keep]
  pheno <- factor(group_vec, levels = c(control_group, case_group))

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
      beta <- cbind(beta, new_col)
      pheno <- factor(c(as.character(pheno), g), levels = c(control_group, case_group))
    }
  }
  list(beta = beta, pheno = pheno)
}

#' Count usable genomic clusters as a fast pre-check.
#'
#' @param beta Beta matrix.
#' @param pf probe.features annotation (or NULL to skip).
#' @param max_gap Maximum gap (bp) joining probes into a cluster.
#' @param min_probes Minimum probes per cluster.
#' @return Number of qualifying clusters, or \code{NA} when the check is skipped.
count_usable_clusters <- function(beta, pf, max_gap, min_probes) {
  if (is.null(pf)) {
    return(NA_integer_)
  }
  cpg_idx <- intersect(rownames(beta), rownames(pf))
  if (length(cpg_idx) == 0L) {
    emit_error("Genomic alignment error: no overlap between beta features and the probe annotation. The arraytype likely does not match the data.")
  }
  anno <- pf[cpg_idx, ]
  anno <- anno[order(anno$CHR, anno$MAPINFO), ]
  cl <- bumphunter::clusterMaker(anno$CHR, anno$MAPINFO, maxGap = max_gap)
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
  if (is.null(dmr_table) || nrow(dmr_table) == 0L) {
    return(empty)
  }

  data.frame(
    ID = paste0("DMR_", seq_len(nrow(dmr_table))),
    N_DMPS = pick_col(dmr_table, c("L", "nCpGs", "nprobes"), fallback = NA_real_),
    CHR = pick_col(dmr_table, c("seqnames", "chr"), fallback = NA_real_),
    START = pick_col(dmr_table, c("start"), fallback = NA_real_),
    STOP = pick_col(dmr_table, c("end"), fallback = NA_real_),
    WIDTH = pick_col(dmr_table, c("width"), fallback = NA_real_),
    P_VALUE = pick_col(dmr_table, c("p.valueArea", "p.value"), fallback = NA_real_),
    MEANDIFF = pick_col(dmr_table, c("value", "meanDiff"), fallback = NA_real_),
    stringsAsFactors = FALSE
  )
}


# ── Argument parsing & main flow ──────────────────────────────────────────────

#' Run the DMR discovery pipeline for one job.
#'
#' Parses the CLI arguments, loads/aligns the data, resolves the two comparison
#' groups, runs the cluster pre-check and ChAMP Bumphunter, and writes the region
#' table (CSV + RDS). Fatal problems abort via \code{emit_error()}.
#'
#' Kept as a function so the file can be \code{source()}d for unit testing without
#' executing the pipeline (see the run guard below).
#'
#' @param args Character vector of CLI arguments (defaults to the process args).
#' @return Invisibly \code{TRUE} on success.
main <- function(args = commandArgs(trailingOnly = TRUE)) {
  if (length(args) < 3L) {
    emit_error("Insufficient arguments. Expected: <sample_sheet_path> <job_dir> <beta_filename>")
  }

  sample_sheet_path <- args[1]
  job_dir <- args[2]
  beta_input <- args[3]
  beta_path <- if (file.exists(beta_input)) beta_input else file.path(job_dir, beta_input)

  min_probes <- if (length(args) >= 4) as.numeric(args[4]) else 3
  cutoff_raw <- if (length(args) >= 5) args[5] else "NULL"
  cutoff <- if (toupper(cutoff_raw) %in% c("NULL", "", "NA")) NULL else as.numeric(cutoff_raw)
  adj_pval <- if (length(args) >= 6) as.numeric(args[6]) else 0.05
  max_gap <- if (length(args) >= 7) as.numeric(args[7]) else 1000
  # Array type: prefer the value minfi detected during filtering (array_type.txt);
  # the CLI argument is only a fallback. This prevents loading the wrong ChAMP
  # annotation (e.g. EPICv2 on 450K data -> "object 'probe.features' not found").
  array_type <- read_array_type(job_dir, fallback = if (length(args) >= 8) args[8] else "EPICv2")
  n_bootstraps <- if (length(args) >= 9) as.integer(args[9]) else 10L
  n_cores <- if (length(args) >= 10) as.integer(args[10]) else 1L

  # Dynamic comparison (any column) + deterministic sign via the control reference.
  group_column <- if (length(args) >= 11 && nzchar(args[11])) args[11] else "Sample_Group"
  case_group <- if (length(args) >= 12 && nzchar(args[12])) args[12] else ""
  control_group <- if (length(args) >= 13 && nzchar(args[13])) args[13] else ""

  numeric_params <- c(min_probes, adj_pval, max_gap, n_bootstraps, n_cores)
  if (!is.null(cutoff)) numeric_params <- c(numeric_params, cutoff)
  if (any(is.na(numeric_params))) {
    emit_error("Parameter validation failed: non-numeric values detected in numerical arguments.")
  }
  if (n_bootstraps < 1L) emit_error("Configuration error: nBootstraps must be >= 1.")
  if (n_cores < 1L) emit_error("Configuration error: nCores must be >= 1.")
  if (!dir.exists(job_dir)) dir.create(job_dir, recursive = TRUE)

  emit_progress(0, "Initializing Differential Methylation Region (DMR) workflow")

  # Parallel backend (fall back to sequential on any failure).
  emit_progress(5, "Configuring parallel compute environment")
  if (n_cores == 1L) {
    registerDoSEQ()
  } else {
    ok <- tryCatch(
      {
        n_actual <- min(n_cores, parallel::detectCores(logical = FALSE))
        cl_par <- makeCluster(n_actual)
        registerDoParallel(cl_par)
        on.exit(stopCluster(cl_par), add = TRUE)
        TRUE
      },
      error = function(e) FALSE
    )
    if (!isTRUE(ok)) {
      emit_progress(5, "Parallel setup failed; falling back to sequential processing.")
      registerDoSEQ()
    }
  }

  emit_progress(15, "Loading and validating methylation beta matrix")
  beta <- load_beta_matrix(beta_path)
  beta <- clamp_beta(beta)

  emit_progress(35, "Loading and aligning sample sheet metadata")
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
  if (any(is.na(samples[[group_column]]))) {
    emit_error(sprintf("Group column '%s' contains missing values.", group_column))
  }
  # Strict alignment: every beta column must map 1:1 to a sample-sheet row.
  samples_aligned <- align_samples_to_matrix(beta, samples, mode = "strict")$samples

  emit_progress(50, "Selecting case/control groups")
  group_vec <- as.character(samples_aligned[[group_column]])
  groups <- resolve_case_control(group_vec, group_column, case_group, control_group)
  design <- build_two_group_design(beta, group_vec, groups$case, groups$control)
  beta <- design$beta
  pheno <- design$pheno

  emit_progress(65, "Validating genomic probe density and clusters")
  # Load the correct probe annotation AND bind it globally as `probe.features`, so
  # ChAMP's internals always find it (guards against "object 'probe.features' not
  # found" regardless of ChAMP's own arraytype handling).
  pf <- ensure_probe_features(array_type)
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
      arraytype  = champ_arraytype(array_type),
      method     = "Bumphunter",
      minProbes  = min_probes,
      cutoff     = cutoff,
      adjPvalDmr = adj_pval,
      maxGap     = max_gap,
      B          = n_bootstraps
    ),
    error = function(e) {
      msg <- conditionMessage(e)
      # champ.DMR aborts with "No DMR detected." when Bumphunter finds zero
      # regions. Finding no DMRs is a valid scientific outcome, not a failure, so
      # route it to the empty-result path (status 0, empty table) instead of
      # failing the whole job — otherwise the downstream steps are blocked by a
      # result that simply says "no regions".
      if (grepl("No DMR detected", msg, ignore.case = TRUE)) {
        return(list(BumphunterDMR = NULL))
      }
      emit_error(sprintf("ChAMP DMR execution failed: %s", msg))
    }
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
  tryCatch(
    {
      write.csv(dmr_out, output_csv, row.names = FALSE)
      saveRDS(dmr_out, output_rds)
    },
    error = function(e) emit_error(sprintf("Failed to save DMR results: %s", conditionMessage(e)))
  )

  emit_done(
    output_csv     = output_csv,
    output_rds     = output_rds,
    total_dmrs     = nrow(dmr_out),
    no_significant = no_significant_dmrs
  )
  invisible(TRUE)
}

# Run only when executed as a script (Rscript). When source()d/sys.source()d for
# unit testing, sys.nframe() > 0, so the pipeline does not auto-run and the
# functions above can be tested in isolation.
if (sys.nframe() == 0L) {
  main()
  quit(save = "no", status = 0)
}
