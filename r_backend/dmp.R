#!/usr/bin/env Rscript

#' Differential Methylation Probe Analysis
#'
#' Executes a DMP analysis using ChAMP::champ.DMP().
#'
#' Workflow:
#'   1. Load beta matrix
#'   2. Validate methylation data
#'   3. Align phenotype metadata
#'   4. Execute differential methylation analysis
#'   5. Filter significant probes
#'   6. Link DMPs to DMR regions
#'   7. Export results
#'
#' Usage:
#'   Rscript dmp.R <sample_sheet.csv> <job_dir> <beta.rds> [adjPVal] [arraytype]
#'
#' Arguments:
#'   sample_sheet.csv : Illumina sample sheet
#'   job_dir          : Pipeline working directory
#'   beta.rds         : Beta matrix file
#'   adjPVal          : Adjusted p-value threshold
#'   arraytype        : EPICv2, EPICv1 or 450K

# ── Libraries used ───────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(ChAMP)
  library(readr)
  library(jsonlite)
})

# ── Integrate Progress contract ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")

# ── Input parameters ─────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  emit_error("Insufficient arguments. Expected: <sample_sheet_path> <job_dir> <beta_filename>")
}

sample_sheet_path <- args[1]
job_dir           <- args[2]
beta_filename     <- args[3]

# FIX: Flexibly detects whether an absolute or relative path was passed.
beta_path <- if (file.exists(beta_filename)) {
  beta_filename
} else {
  file.path(job_dir, beta_filename)
}

adjPVal           <- if (length(args) >= 4) as.numeric(args[4]) else 0.05
arraytype         <- if (length(args) >= 5) args[5]             else "EPICv2"

#  Normalize array type aliases
if (arraytype %in% c("EPIC", "850K")) {
  arraytype <- "EPICv1"
}

if (!arraytype %in% c("EPICv2", "EPICv1", "450K")) {
  emit_error(sprintf("Invalid arraytype provided: '%s'. Allowed values are: EPICv2, EPICv1, 450K", arraytype))
}

if (!dir.exists(job_dir)) {
  dir.create(job_dir, recursive = TRUE)
}

# Report initialization to the backend
emit_progress(0, "Initializing Differential Methylation Probe (DMP) workflow")

# ── Beta-Matrix load ─────────────────────────────────────────────────────────
emit_progress(15, "Loading and validating methylation beta matrix")

if (!file.exists(beta_path)) {
  emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
}

beta <- tryCatch(
  readRDS(beta_path),
  error = function(e) {
    emit_error(
      sprintf(
        "Failed to load beta matrix '%s': %s",
        beta_path,
        conditionMessage(e)
      )
    )
  }
)

# S4 Extract beta matrix from minfi object
if (isS4(beta)) {
  suppressPackageStartupMessages(library(minfi))
  beta <- minfi::getBeta(beta)
}

beta <- as.matrix(beta)

if (!is.numeric(beta)) {
  emit_error(
    "Invalid beta matrix: matrix contains non-numeric values."
  )
}

if (any(is.na(beta))) {
  emit_error("Loaded beta matrix contains NA values.")
}

if (any(is.nan(beta))) {
  emit_error("Loaded beta matrix contains NaN values.")
}

if (any(is.infinite(beta))) {
  emit_error("Loaded beta matrix contains infinite values.")
}

# Clamp corrected beta values to the valid methylation range.
if (any(beta < 0, na.rm = TRUE) || any(beta > 1, na.rm = TRUE)) {
  beta[beta < 0] <- 0
  beta[beta > 1] <- 1
}

if (nrow(beta) == 0 || ncol(beta) == 0) {
  emit_error("Loaded beta matrix is empty (0 features or 0 samples)")
}

# ──────────────────────────────────────────────────────────────────────────────
#  MATHEMATICAL SHIELD: Eliminate invariant & incomplete probes
# ──────────────────────────────────────────────────────────────────────────────
row_sds <- apply(beta, 1, sd, na.rm = TRUE)
has_nas  <- apply(beta, 1, anyNA)

# Retain only probes that do not contain NAs and exhibit genuine variance.
valid_probes <- which(!has_nas & !is.na(row_sds) & row_sds > 1e-5)

if (length(valid_probes) == 0) {
  emit_error("Data anomaly: No valid probes remaining after filtering out invariant or incomplete rows.")
}

beta <- beta[valid_probes, , drop = FALSE]
# ──────────────────────────────────────────────────────────────────────────────

# ── Sample Sheet load ────────────────────────────────────────────────────────
emit_progress(35, "Loading and parsing sample sheet metadata")

if (!file.exists(sample_sheet_path)) {
  emit_error(sprintf("Sample sheet file not found at path: %s", sample_sheet_path))
}

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))
skip_lines <- if (length(data_start) > 0) data_start[[1]] else 0

samples <- tryCatch(
  read_csv(
    sample_sheet_path,
    skip = skip_lines,
    show_col_types = FALSE
  ),
  error = function(e) {
    emit_error(
      sprintf(
        "Failed to parse sample sheet '%s': %s",
        sample_sheet_path,
        conditionMessage(e)
      )
    )
  }
)

required <- c("Sample_Name", "Sample_Group")
if (!all(required %in% colnames(samples))) {
  emit_error(sprintf("Sample sheet is missing mandatory columns. Found: %s", paste(colnames(samples), collapse = ", ")))
}

# –––––––––––––Robust alignment between phenotype metadata and beta matrix samples.–––––––

emit_progress(55, "Aligning sample sheet metadata with beta matrix columns")

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

if (anyDuplicated(samples$Sample_Name)) {
  emit_error(
    "Sample sheet contains duplicate Sample_Name values."
  )
}

if (any(is.na(samples$Sample_Group))) {
  emit_error(
    "Sample_Group contains missing values."
  )
}

samples_filtered <- samples[samples[[id_col]] %in% beta_samples, , drop = FALSE]
match_idx        <- match(beta_samples, samples_filtered[[id_col]])
samples_aligned  <- samples_filtered[match_idx, , drop = FALSE]

if (nrow(samples_aligned) != ncol(beta)) {
  emit_error("Sample alignment mismatch: Aligned samples count does not match beta matrix columns.")
}

pheno <- factor(samples_aligned$Sample_Group)

if (length(levels(pheno)) != 2) {
  emit_error(sprintf("Statistical group error: Exactly 2 distinct groups are required for DMP analysis. Found: %s", paste(levels(pheno), collapse = ", ")))
}

group1 <- levels(pheno)[1]
group2 <- levels(pheno)[2]

# ── ChAMP workaround for single-sample groups. (Verhindert ChAMP-Dimension-Drop) ────────
group_sizes <- table(pheno)

if (any(group_sizes < 2)) {
  emit_error(
    paste0(
      "DMP analysis requires at least two biological samples per group. Found: ",
      paste(
        names(group_sizes),
        group_sizes,
        sep = "=",
        collapse = ", "
      )
    )
  )
}

# ── DMP-Analyse via champ.DMP ─────────────────────────────────────────────────
emit_progress(75, "Executing statistical differential methylation test (champ.DMP)")

dmp_raw <- tryCatch({
  champ.DMP(
    beta      = beta,
    pheno     = pheno,
    adjPVal   = 1, 
    arraytype = arraytype
  )
}, error = function(e) {
  emit_error(sprintf("ChAMP DMP mathematical execution failed: %s", e$message))
})

# ── Extract result ──────────────────────────────────────────────────────
emit_progress(85, "Extracting statistical contrasts and computing metrics")

if (is.null(dmp_raw) || length(dmp_raw) == 0) {
  emit_error("Analysis anomaly: champ.DMP returned an empty result object.")
}

comparison_key <- names(dmp_raw)[1]
dmp_table <- dmp_raw[[comparison_key]]

if (is.null(dmp_table) || nrow(dmp_table) == 0) {
  emit_error("DMP extraction failed: Table is empty. Verify that the arraytype matches the dataset architecture.")
}

if (!"deltaBeta" %in% colnames(dmp_table)) {
  emit_error(
    "DMP result table does not contain deltaBeta column."
  )
}

p_col <- intersect(c("adj.P.Val", "adj.p.val", "P.Value", "p.value"), colnames(dmp_table))[1]
col_group1 <- paste0(group1, "_AVG")
col_group2 <- paste0(group2, "_AVG")

if (!col_group1 %in% colnames(dmp_table) || !col_group2 %in% colnames(dmp_table)) {
  col_group1 <- intersect(colnames(dmp_table), paste0(levels(pheno), "_AVG"))[1]
  col_group2 <- intersect(colnames(dmp_table), paste0(levels(pheno), "_AVG"))[2]
}
# LOG_FC column removed.
# DELTA_BETA is the primary methylation effect size.

eps <- 1e-8
dmp <- data.frame(
  ID         = rownames(dmp_table),
  CHR        = dmp_table$CHR,
  POS        = dmp_table$MAPINFO,
  GENE       = dmp_table$gene,
  FEATURE    = dmp_table$feature,
  CGI        = dmp_table$cgi,
  ADJ_P      = dmp_table[[p_col]],
  GROUP1_AVG = dmp_table[[col_group1]],
  GROUP2_AVG = dmp_table[[col_group2]],
  DELTA_BETA = dmp_table$deltaBeta,
  #LOG_FC     = log2((dmp_table[[col_group2]] + eps) / (dmp_table[[col_group1]] + eps)),
  DMR_ID     = "-",
  stringsAsFactors = FALSE
)

# NA Cleaning & Filtering
dmp <- dmp[!is.na(dmp$GROUP1_AVG) & !is.na(dmp$GROUP2_AVG), ]
dmp_filtered <- dmp[!is.na(dmp$ADJ_P) & dmp$ADJ_P <= adjPVal, ]

if (nrow(dmp_filtered) == 0) {

  min_p <- suppressWarnings(
    min(dmp$ADJ_P, na.rm = TRUE)
  )

  if (!is.finite(min_p)) {
    min_p <- NA_real_
  }

  error_message <- sprintf(
    paste(
      "Filtering constraint violation:",
      "No significant DMPs remaining after threshold filter",
      "(adjPVal <= %g).",
      "Minimum observed adjusted p-value: %s"
    ),
    adjPVal,
    as.character(min_p)
  )

  emit_error(error_message)
}

# ── DMR linking via genomic position ─────────────────────────────────────
emit_progress(95, "Overlapping found DMPs with genomic DMR region coordinates")

dmr_rds_path <- file.path(job_dir, "dmr_results.rds")

if (file.exists(dmr_rds_path)) {
  dmr_data <- tryCatch(
    readRDS(dmr_rds_path),
    error = function(e) {
      emit_error(
        sprintf(
          "Failed to load DMR results '%s': %s",
          dmr_rds_path,
          conditionMessage(e)
        )
      )
    }
  )
  
  if (!is.null(dmr_data) && nrow(dmr_data) > 0) {
    dmp_filtered$DMR_ID <- vapply(seq_len(nrow(dmp_filtered)), function(i) {
      dmp_chr <- as.character(dmp_filtered$CHR[i])
      dmp_pos <- as.numeric(dmp_filtered$POS[i])
      
      hit <- which(
        as.character(dmr_data$CHR) == dmp_chr &
        as.numeric(dmr_data$START) <= dmp_pos &
        as.numeric(dmr_data$STOP)  >= dmp_pos
      )
      
      if (length(hit) == 0) {
        "-"
      } else {
        paste(
          unique(dmr_data$ID[hit]),
          collapse = ";"
        )
      }
    }, character(1))
  }
}

# ── Save ─────────────────────────────────────────────────────────────────
emit_progress(100, "Saving computed DMP results into pipeline assets")

output_csv <- file.path(job_dir, "dmp_results.csv")
output_rds <- file.path(job_dir, "dmp_results.rds")

write.csv(dmp_filtered, output_csv, row.names = FALSE)
saveRDS(dmp_filtered,   output_rds)

# Submit final success notification to the backend.
emit_done(
  output_csv = output_csv,
  output_rds = output_rds,
  total_dmps = nrow(dmp_filtered)
)

quit(save = "no", status = 0)