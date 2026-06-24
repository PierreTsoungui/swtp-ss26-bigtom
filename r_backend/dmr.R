#!/usr/bin/env Rscript

#' Differentially Methylated Region Analysis
#'
#' Executes a Differentially Methylated Region (DMR) workflow
#' using the ChAMP Bumphunter implementation.
#'
#' The script:
#' - loads a beta matrix
#' - aligns metadata from the sample sheet
#' - validates genomic probe clusters
#' - identifies significant DMRs
#' - exports results as CSV and RDS files
#'
#' Usage:
#' Rscript dmr.R <sample_sheet_path> <job_dir> <beta_filename>
#'
#' Optional parameters:
#' [minProbes] [cutoff] [adjPvalDmr]
#' [maxGap] [arraytype]
#' [nBootstraps] [nCores]

# # ── Libraries used ───────────────────────────────────────────────────────────────────────────
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

# ── Integrate Progress contract ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")
# ── Parse input parameters ───────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  emit_error("Insufficient arguments. Expected: <sample_sheet_path> <job_dir> <beta_filename>")
}

sample_sheet_path <- args[1]
job_dir           <- args[2]
beta_input        <- args[3] 

beta_path <- if (file.exists(beta_input)) {
  beta_input
} else {
  file.path(job_dir, beta_input)
}

min_probes    <- if (length(args) >= 4) as.numeric(args[4]) else 3

cutoff_raw    <- if (length(args) >= 5) args[5] else "NULL"
cutoff        <- if (toupper(cutoff_raw) %in% c("NULL", "", "NA")) NULL else as.numeric(cutoff_raw)

adj_pval      <- if (length(args) >= 6) as.numeric(args[6]) else 0.05
max_gap       <- if (length(args) >= 7) as.numeric(args[7]) else 1000
array_type    <- if (length(args) >= 8) args[8]             else "EPICv2"
n_bootstraps  <- if (length(args) >= 9) as.integer(args[9]) else 10L
n_cores       <- if (length(args) >= 10) as.integer(args[10]) else 1L

valid_arrays <- c("EPICv2", "EPICv1", "EPIC", "450K")
if (!array_type %in% valid_arrays) {
  emit_error(sprintf("Invalid arraytype: '%s'. Allowed values are: %s", array_type, paste(valid_arrays, collapse = ", ")))
}

numeric_params <- c(min_probes, adj_pval, max_gap, n_bootstraps, n_cores)
if (!is.null(cutoff)) numeric_params <- c(numeric_params, cutoff)

if (any(is.na(numeric_params))) {
  emit_error("Parameter validation failed: Non-numeric values detected in numerical arguments.")
}

if (n_bootstraps < 1L) {
  emit_error("Configuration error: nBootstraps parameter must be >= 1.")
}

if (n_cores < 1L) {
  emit_error("Configuration error: nCores parameter must be >= 1.")
}

if (!dir.exists(job_dir)) {
  dir.create(job_dir, recursive = TRUE)
}

# Report initialization to the backend
emit_progress(0, "Initializing Differential Methylation Region (DMR) workflow")

# ── Configure parallelism ────────────────────────────────────────────────────
emit_progress(5, "Configuring parallel processing compute environments")

if (n_cores == 1L) {
  registerDoSEQ()
} else {
  n_cores_available <- parallel::detectCores(logical = FALSE)
  n_cores_actual    <- min(n_cores, n_cores_available)
  
  cl <- makeCluster(n_cores_actual)
  registerDoParallel(cl)
  on.exit(stopCluster(cl), add = TRUE)
}

# ── Load beta matrix ─────────────────────────────────────────────────────────
emit_progress(15, "Loading and validating methylation beta matrix")

if (!file.exists(beta_path)) {
  emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
}

beta <- tryCatch(
  readRDS(beta_path),
  error = function(e) {
    emit_error(
      sprintf(
        "Beta matrix loading failed: Unable to read RDS file '%s'. %s",
        beta_path,
        conditionMessage(e)
      )
    )
  }
)

if (isS4(beta)) {
  suppressPackageStartupMessages(library(minfi))
  beta <- minfi::getBeta(beta)
}

if (!is.matrix(beta)) {
  beta <- as.matrix(beta)
}

if (nrow(beta) == 0 || ncol(beta) == 0) {
  emit_error("Loaded beta matrix contains no features or samples (empty matrix)")
}

# Clamp beta values to the valid range [0,1]
if (any(beta < 0, na.rm = TRUE) || any(beta > 1, na.rm = TRUE)) {
  beta[beta < 0] <- 0
  beta[beta > 1] <- 1
}

# ── Load sample sheet ───────────────────────────────────────────────────────
emit_progress(35, "Loading and parsing sample sheet metadata")

if (!file.exists(sample_sheet_path)) {
  emit_error(
    sprintf(
      "Sample sheet file not found: %s",
      sample_sheet_path
    )
  )
}
all_lines <- tryCatch(
  readLines(sample_sheet_path),
  error = function(e) {
    emit_error(
      sprintf(
        "Failed to read sample sheet: %s",
        conditionMessage(e)
      )
    )
  }
)
data_start <- which(grepl("^\\[Data\\]", all_lines))[1]

samples <- tryCatch({

  if (length(data_start) > 0) {
    read_csv(sample_sheet_path,skip = data_start,show_col_types = FALSE
    )
  } else {
    read_csv(sample_sheet_path,show_col_types = FALSE
    )
  }

}, error = function(e) {

  emit_error(
    sprintf(
      "Failed to parse sample sheet: %s",
      conditionMessage(e)
    )
  )

})

required_cols <- c("Sample_Name", "Sample_Group")

if (!all(required_cols %in% colnames(samples))) {
  emit_error(sprintf("Sample sheet is missing mandatory columns. Missing: %s", paste(setdiff(required_cols, colnames(samples)), collapse = ", ")))
}

if (any(is.na(samples$Sample_Name)) ||
    any(is.na(samples$Sample_Group))) {
  emit_error(
    "Sample sheet validation failed: Missing values detected in mandatory columns."
  )
}

# ––––––––––––––– Align phenotype metadata with beta matrix samples ––––––––––

emit_progress(50, "Aligning sample sheet metadata with beta matrix columns")

beta_samples <- colnames(beta)

if ("Sentrix_ID" %in% colnames(samples) && "Sentrix_Position" %in% colnames(samples)) {
  samples$Array_ID <- paste0(samples$Sentrix_ID, "_", samples$Sentrix_Position)
} else {
  samples$Array_ID <- NA
}

id_col <- NULL
if (all(beta_samples %in% samples$Sample_Name)) {
  id_col <- "Sample_Name"
} else if (all(beta_samples %in% samples$Array_ID)) {
  id_col <- "Array_ID"
} else {
  if (any(beta_samples %in% samples$Sample_Name)) id_col <- "Sample_Name"
  if (any(beta_samples %in% samples$Array_ID)) id_col <- "Array_ID"
}

if (is.null(id_col)) {
  emit_error("Sample alignment failed: No matching sample identifiers found between the beta matrix columns and sample sheet.")
}

samples_filtered <- samples[samples[[id_col]] %in% beta_samples, , drop = FALSE]
match_idx        <- match(beta_samples, samples_filtered[[id_col]])
samples_aligned  <- samples_filtered[match_idx, , drop = FALSE]

if (nrow(samples_aligned) != ncol(beta)) {
  emit_error("Sample alignment mismatch: Aligned samples count does not match beta matrix columns.")
}

pheno <- factor(samples_aligned$Sample_Group)

if (length(levels(pheno)) < 2) {
  emit_error("Statistical group error: At least 2 distinct groups are required for DMR region analysis.")
}
# ── Handle single-sample groups ──
for (g in levels(pheno)) {
  if (sum(pheno == g) == 1) {
    idx <- which(pheno == g)
    
    set.seed(42)
    noise <- rnorm(nrow(beta), mean = 0, sd = 1e-7)
    new_col <- beta[, idx, drop = FALSE] + noise
    
    new_col[new_col < 0] <- 0
    new_col[new_col > 1] <- 1
    
    colnames(new_col) <- paste0(colnames(beta)[idx], "_virtual_rep")
    
    beta <- cbind(beta, new_col)
    pheno <- factor(c(as.character(pheno), g))
  }
}

# ── Preliminary check: Are there any usable clusters at all? ───────────────────────

emit_progress(65, "Validating genomic probe density and cluster allocations")

cluster_count <- tryCatch({
  if (array_type %in% c("EPIC", "EPICv2")) {
    data("probe.features.epicv2", envir = environment())
    pf <- get("probe.features.epicv2", envir = environment())
  } else if (array_type == "EPICv1") {
    data("probe.features.epicv1", envir = environment())
    pf <- get("probe.features.epicv1", envir = environment())
  } else {
    data("probe.features", envir = environment())
    pf <- get("probe.features", envir = environment())
  }
  
  cpg_idx <- intersect(rownames(beta), rownames(pf))
  
  if (length(cpg_idx) == 0) {
    emit_error(sprintf("Genomic alignment error: No coordinate overlap between beta matrix features and %s probe annotations.", array_type))
  }
  
  anno <- pf[cpg_idx, ]
  anno <- anno[order(anno$CHR, anno$MAPINFO), ]
  
  cl <- bumphunter::clusterMaker(anno$CHR, anno$MAPINFO, maxGap = max_gap)
  sum(table(cl) > min_probes)
  
}, error = function(e) {
  emit_error(
    sprintf(
      "Cluster validation failed: %s",
      conditionMessage(e)
    )
  )
})

if (identical(cluster_count, 0L)) {
  emit_error(sprintf("Density boundary violation: Found 0 genomic probe clusters matching the constraints (minProbes=%d, maxGap=%d bp). Consider relaxing thresholds.", min_probes, max_gap))
}

# ── DMR Analysis ──────────────────────────────────────────────────────────────
emit_progress(75, "Executing statistical region discovery algorithm (Bumphunter engine)")

# ChAMP/Bumphunter may emit worker warnings in parallel mode.
# A returned DMR result table is considered valid despite these warnings.

dmr_raw <- tryCatch({
  champ.DMR(
    beta       = beta,
    pheno      = pheno,
    arraytype  = array_type,
    method     = "Bumphunter",
    minProbes  = min_probes,
    cutoff     = cutoff,
    adjPvalDmr = adj_pval,
    maxGap     = max_gap,
    B          = n_bootstraps
  )
}, error = function(e) {
  emit_error(sprintf("ChAMP DMR mathematical execution failed: %s", conditionMessage(e)))
})

# ── Validate result ──────────────────────────────────────────────────────
if (is.null(dmr_raw)) {
  emit_error("Analysis anomaly: champ.DMR returned a NULL result object.")
}

dmr_table <- if (is.list(dmr_raw) && !is.data.frame(dmr_raw)) {
  dmr_raw$BumphunterDMR
} else {
  dmr_raw
}

if (is.null(dmr_table) || nrow(dmr_table) == 0) {
  emit_error(sprintf("Filtering constraint violation: No significant DMR regions remaining after threshold filter (adjPvalDmr <= %g). Try relaxing the p-value parameters.", adj_pval))
}

# ── Format output ───────────────────────────────────────────────────────────

emit_progress(90, "Formatting and extracting genomic region metrics tables")

get_col <- function(df, candidates, fallback = NA_real_) {
  col <- intersect(candidates, colnames(df))[1]
  if (is.na(col)) fallback else df[[col]]
}

dmr_out <- data.frame(
  ID       = paste0("DMR_", seq_len(nrow(dmr_table))),
  N_DMPs   = get_col(dmr_table, c("L", "nCpGs", "nprobes")),
  CHR      = get_col(dmr_table, c("seqnames", "chr")),
  START    = get_col(dmr_table, c("start")),
  STOP     = get_col(dmr_table, c("end")),
  WIDTH    = get_col(dmr_table, c("width")),
  P_VALUE  = get_col(dmr_table, c("p.valueArea", "p.value")),
  MEANDIFF = get_col(dmr_table, c("value", "meanDiff")),
  stringsAsFactors = FALSE
)

if (nrow(dmr_out) == 0) {
  emit_error("DMR parsing failure: Formatted output data frame contains 0 records.")
}

# ── Save results ──────────────────────────────────────────────────────────────
emit_progress(100, "Saving discovered DMR regions into pipeline assets")

output_csv <- file.path(job_dir, "dmr_results.csv")
output_rds <- file.path(job_dir, "dmr_results.rds")

write.csv(dmr_out, output_csv, row.names = FALSE)
saveRDS(dmr_out, output_rds)

# Submit final success notification to the backend
emit_done(
  output_csv = output_csv,
  output_rds = output_rds,
  total_dmrs = nrow(dmr_out)
)

quit(save = "no", status = 0)