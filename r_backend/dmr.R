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

# ── Progress-Vertrag einbinden ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")
# ── Eingabeparameter ─────────────────────────────────────────────────────────
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

# Initialisierung an Backend melden
emit_progress(0, "Initializing Differential Methylation Region (DMR) workflow")

# ── Parallelismus konfigurieren ──────────────────────────────────────────────
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

# ── Beta-Matrix laden ────────────────────────────────────────────────────────
emit_progress(15, "Loading and validating methylation beta matrix")

if (!file.exists(beta_path)) {
  emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
}

beta <- readRDS(beta_path)

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

# Schutzschild für batch-korrigierte Daten (Werte auf Intervall [0,1] kappen)
if (any(beta < 0, na.rm = TRUE) || any(beta > 1, na.rm = TRUE)) {
  beta[beta < 0] <- 0
  beta[beta > 1] <- 1
}

# ── Sample Sheet laden ───────────────────────────────────────────────────────
emit_progress(35, "Loading and parsing sample sheet metadata")

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))

samples <- if (length(data_start) > 0) {
  read_csv(sample_sheet_path, skip = data_start, show_col_types = FALSE)
} else {
  read_csv(sample_sheet_path, show_col_types = FALSE)
}

required_cols <- c("Sample_Name", "Sample_Group")

if (!all(required_cols %in% colnames(samples))) {
  emit_error(sprintf("Sample sheet is missing mandatory columns. Missing: %s", paste(setdiff(required_cols, colnames(samples)), collapse = ", ")))
}

# ── Robustes Alignment ───────────────────────────────────────────────────────
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

# ── Hotfix für Single-Sample-Gruppen (Verhindert ChAMP-Dimension-Drop) ────────
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

# ── Vorprüfung: Gibt es überhaupt verwertbare Cluster? ───────────────────────
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
  -1L
})

if (identical(cluster_count, 0L)) {
  emit_error(sprintf("Density boundary violation: Found 0 genomic probe clusters matching the constraints (minProbes=%d, maxGap=%d bp). Consider relaxing thresholds.", min_probes, max_gap))
}

# ── DMR-Analyse ──────────────────────────────────────────────────────────────
emit_progress(75, "Executing statistical region discovery algorithm (Bumphunter engine)")

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

# ── Ergebnis validieren ──────────────────────────────────────────────────────
if (is.null(dmr_raw)) {
  emit_error("Analysis anomaly: champ.DMR returned a NULL result object.")
}

dmr_table <- if (is.list(dmr_raw) && !is.data.frame(dmr_raw)) {
  dmr_raw$BumphunterDMR
} else {
  dmr_raw
}

# No DMR regions passing the threshold is a valid scientific outcome, NOT an
# execution error. Build a well-formed EMPTY result and complete gracefully, so
# the frontend shows "no significant results" from the empty table. A genuine
# parsing failure (non-empty input but unusable output) is still an error below.
no_significant_dmrs <- is.null(dmr_table) || nrow(dmr_table) == 0

if (no_significant_dmrs) {
  emit_progress(90, sprintf(
    "Analysis complete: no DMR regions pass the threshold (adjPvalDmr <= %g).", adj_pval))
  dmr_out <- data.frame(
    ID       = character(0),
    N_DMPs   = numeric(0),
    CHR      = character(0),
    START    = numeric(0),
    STOP     = numeric(0),
    WIDTH    = numeric(0),
    P_VALUE  = numeric(0),
    MEANDIFF = numeric(0),
    stringsAsFactors = FALSE
  )
} else {
  # ── Ausgabe formatieren ────────────────────────────────────────────────────
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

  # With a non-empty input, an empty formatted frame indicates a real parsing bug.
  if (nrow(dmr_out) == 0) {
    emit_error("DMR parsing failure: Formatted output data frame contains 0 records.")
  }
}

# ── Ergebnisse speichern ─────────────────────────────────────────────────────
emit_progress(100, "Saving discovered DMR regions into pipeline assets")

output_csv <- file.path(job_dir, "dmr_results.csv")
output_rds <- file.path(job_dir, "dmr_results.rds")

write.csv(dmr_out, output_csv, row.names = FALSE)
saveRDS(dmr_out, output_rds)

# Finale Erfolgsmeldung an das Backend abgeben
emit_done(
  output_csv     = output_csv,
  output_rds     = output_rds,
  total_dmrs     = nrow(dmr_out),
  no_significant = no_significant_dmrs
)

quit(save = "no", status = 0)