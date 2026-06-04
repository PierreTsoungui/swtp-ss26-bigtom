#!/usr/bin/env Rscript

#' DMR-Analyse
#'
#' Ausführung:
#'   Rscript dmr.R <beta_rds> <sample_sheet> <job_dir>
#' Optional:
#'   [minProbes] [cutoff] [adjPvalDmr] [maxGap] [arraytype] [nBootstraps] [nCores]

# ── Verwendete Bibliotheken ──────────────────────────────────────────────────
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

# ── Logging ──────────────────────────────────────────────────────────────────
log_msg <- function(status, message, step = NULL) {
  cat(toJSON(list(status = status, step = step, message = message),
             auto_unbox = TRUE), "\n")
  invisible(NULL)
}

exit_with_error <- function(message, step = NULL) {
  log_msg("error", message, step)
  quit(save = "no", status = 1)
}

# ── Eingabeparameter ─────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop(paste(
    "Usage: Rscript dmr.R <beta_rds> <sample_sheet> <job_dir>",
    "[minProbes] [cutoff] [adjPvalDmr] [maxGap] [arraytype] [nBootstraps] [nCores]"
  ))
}

beta_path         <- args[1]
sample_sheet_path <- args[2]
job_dir           <- args[3]

min_probes    <- if (length(args) >= 4) as.numeric(args[4]) else 3
cutoff        <- if (length(args) >= 5) as.numeric(args[5]) else NULL
adj_pval      <- if (length(args) >= 6) as.numeric(args[6]) else 0.05
max_gap       <- if (length(args) >= 7) as.numeric(args[7]) else 1000
array_type    <- if (length(args) >= 8) args[8]             else "EPICv2"
n_bootstraps  <- if (length(args) >= 9) as.integer(args[9]) else 10L
n_cores       <- if (length(args) >= 10) as.integer(args[10]) else 1L

valid_arrays <- c("EPICv2", "EPICv1", "EPIC", "450K")
if (!array_type %in% valid_arrays) {
  exit_with_error(
    paste("Invalid arraytype:", array_type,
          "— must be one of:", paste(valid_arrays, collapse = ", ")),
    "validate_params"
  )
}

numeric_params <- c(min_probes, adj_pval, max_gap, n_bootstraps, n_cores)
if (!is.null(cutoff)) numeric_params <- c(numeric_params, cutoff)

if (any(is.na(numeric_params))) {
  exit_with_error("Invalid numeric parameter(s)", "validate_params")
}

if (n_bootstraps < 1L) {
  exit_with_error("nBootstraps must be >= 1", "validate_params")
}

if (n_cores < 1L) {
  exit_with_error("nCores must be >= 1", "validate_params")
}

# ── Parallelismus konfigurieren ──────────────────────────────────────────────
if (n_cores == 1L) {
  registerDoSEQ()
  log_msg("running", "Parallel computing disabled (nCores=1) — sequential mode", "configure_parallel")
} else {
  n_cores_available <- parallel::detectCores(logical = FALSE)
  n_cores_actual    <- min(n_cores, n_cores_available)
  
  if (n_cores_actual < n_cores) {
    log_msg("running", paste0("Requested ", n_cores, " cores but only ", n_cores_available, " available — using ", n_cores_actual), "configure_parallel")
  }
  
  cl <- makeCluster(n_cores_actual)
  registerDoParallel(cl)
  on.exit(stopCluster(cl), add = TRUE)
  
  log_msg("running", paste0("Parallel computing enabled: ", n_cores_actual, " core(s)"), "configure_parallel")
}

if (!dir.exists(job_dir)) {
  dir.create(job_dir, recursive = TRUE)
}

# ── Beta-Matrix laden ────────────────────────────────────────────────────────
log_msg("running", "Loading beta matrix", "load_beta")

if (!file.exists(beta_path)) {
  exit_with_error("Beta file missing", "load_beta")
}

beta <- readRDS(beta_path)

if (isS4(beta)) {
  log_msg("running", "S4-Objekt erkannt, extrahiere Beta-Matrix via minfi", "load_beta")
  suppressPackageStartupMessages(library(minfi))
  beta <- minfi::getBeta(beta)
}

if (!is.matrix(beta)) {
  beta <- as.matrix(beta)
}

if (nrow(beta) == 0 || ncol(beta) == 0) {
  exit_with_error("Beta matrix is empty", "validate_beta")
}

# Schutzschild für batch-korrigierte Daten
if (any(beta < 0, na.rm = TRUE) || any(beta > 1, na.rm = TRUE)) {
  log_msg("running", "Batch-korrigierte Beta-Werte leicht außerhalb von [0,1] detektiert. Kappe Werte auf Intervall.", "load_beta")
  beta[beta < 0] <- 0
  beta[beta > 1] <- 1
}

log_msg("running", paste0("Beta matrix loaded: ", nrow(beta), " probes × ", ncol(beta), " samples"), "load_beta")

# ── Sample Sheet laden ───────────────────────────────────────────────────────
log_msg("running", "Loading sample sheet", "load_samples")

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))

samples <- if (length(data_start) > 0) {
  read_csv(sample_sheet_path, skip = data_start, show_col_types = FALSE)
} else {
  read_csv(sample_sheet_path, show_col_types = FALSE)
}

required_cols <- c("Sample_Name", "Sample_Group")

if (!all(required_cols %in% colnames(samples))) {
  exit_with_error(
    paste("Sample sheet missing required columns:", paste(setdiff(required_cols, colnames(samples)), collapse = ", ")),
    "validate_samples"
  )
}

# ── Robustes Alignment ───────────────────────────────────────────────────────
log_msg("running", "Aligning beta columns with sample sheet", "validate_alignment")

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
  exit_with_error("No matching samples found between beta matrix columns and sample sheet.", "validate_alignment")
}

samples_filtered <- samples[samples[[id_col]] %in% beta_samples, , drop = FALSE]
match_idx        <- match(beta_samples, samples_filtered[[id_col]])
samples_aligned  <- samples_filtered[match_idx, , drop = FALSE]

if (nrow(samples_aligned) != ncol(beta)) {
  exit_with_error("Aligned sample count does not match beta matrix column count.", "validate_alignment")
}

pheno <- factor(samples_aligned$Sample_Group)

if (length(levels(pheno)) < 2) {
  exit_with_error("At least 2 groups required", "validate_groups")
}

log_msg("running",
        paste0("Sample sheet aligned: ", paste(paste0(levels(pheno), " (n=", tabulate(pheno), ")"), collapse = ", ")),
        "load_samples")

# ── Hotfix für Single-Sample-Gruppen (Pfeil fixiert) ──────────────────────────
for (g in levels(pheno)) {
  if (sum(pheno == g) == 1) {
    log_msg("running", paste0("Hotfix: Gruppe '", g, "' hat nur 1 Probe. Dupliziere Spalte mit minimalem Rauschen für Bumphunter."), "dmr")
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

# ── Vorprüfung: Gibt es überhaupt verwertbare Cluster? ───────────────────────
log_msg("running", "Validating probe clusters", "validate_clusters")

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
    exit_with_error(
      paste0("No overlap between beta rownames and ", array_type, " probe annotation. Check that rownames(beta) contain CpG IDs and that arraytype is correct."),
      "validate_clusters"
    )
  }
  
  anno <- pf[cpg_idx, ]
  anno <- anno[order(anno$CHR, anno$MAPINFO), ]
  
  cl <- bumphunter::clusterMaker(anno$CHR, anno$MAPINFO, maxGap = max_gap)
  sum(table(cl) > min_probes)
  
}, error = function(e) {
  -1L
})

if (identical(cluster_count, 0L)) {
  exit_with_error(
    paste0("No clusters with more than ", min_probes, " probes within ", max_gap, " bp found. Try reducing minProbes or increasing maxGap."),
    "validate_clusters"
  )
}

if (cluster_count > 0) {
  log_msg("running", paste0(cluster_count, " cluster(s) pass filter (minProbes=", min_probes, ", maxGap=", max_gap, ")"), "validate_clusters")
}

# ── DMR-Analyse ──────────────────────────────────────────────────────────────
log_msg("running",
        paste0("Running DMR analysis (arraytype=", array_type,
               ", minProbes=", min_probes,
               ", maxGap=", max_gap,
               ", adjPvalDmr=", adj_pval,
               ", nBootstraps=", n_bootstraps,
               ", nCores=", if (n_cores == 1L) "1 (sequential)" else n_cores,
               ")"),
        "dmr")

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
  exit_with_error(paste("DMR failed:", conditionMessage(e)), "dmr")
})

# ── Ergebnis validieren ──────────────────────────────────────────────────────
if (is.null(dmr_raw)) {
  exit_with_error("DMR result is NULL", "validate_output")
}

dmr_table <- if (is.list(dmr_raw) && !is.data.frame(dmr_raw)) {
  dmr_raw$BumphunterDMR
} else {
  dmr_raw
}

if (is.null(dmr_table) || nrow(dmr_table) == 0) {
  exit_with_error(paste0("No significant DMRs found (adjPvalDmr=", adj_pval, "). Consider relaxing the threshold."), "validate_output")
}

# ── Ausgabe formatieren ──────────────────────────────────────────────────────
log_msg("running", "Formatting output", "format")

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
  exit_with_error("Formatted DMR table is empty", "validate_format")
}

# ── Ergebnisse speichern ─────────────────────────────────────────────────────
log_msg("running", "Saving results", "save")

output_csv <- file.path(job_dir, "dmr_results.csv")
output_rds <- file.path(job_dir, "dmr_results.rds")

write.csv(dmr_out, output_csv, row.names = FALSE)
saveRDS(dmr_out, output_rds)

log_msg("done", paste0("DMR analysis completed. ", nrow(dmr_out), " DMR(s) written to ", output_csv), "complete")
quit(save = "no", status = 0)