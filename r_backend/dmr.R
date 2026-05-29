#' DMR-Analyse
#' 
#' Ausführung:
#' Rscript dmr.R <beta.rds> <sample_sheet.csv> <job_dir>
#' Optional:
#'   <minProbes> <cutoff> <adjPVal> <distCutoff>
#'
#' Beispiel:
#' Rscript run_dmr_analysis.R beta.rds sample_sheet.csv job_dir 10 0.15 0.01 1000


# ── Verwendete Bibliotheken ───

suppressPackageStartupMessages({
  library(ChAMP)
  library(readr)
  library(minfi)
  library(jsonlite)
})


# ── Logging ───

#' Schreibt strukturierte JSON-Logs für die Analysepipeline.
#' @param status Status der Pipeline
#' @param message Menschenlesbare Beschreibung des aktuellen Schritts.
#' @param step Optionaler Name des Verarbeitungsschritts.
#'
#' @return JSON-String als Konsolenausgabe.

log_msg <- function(status, message, step = NULL) {
  cat(toJSON(list(status = status, step = step, message = message),
             auto_unbox = TRUE), "\n")
}

#' Beendet die Analysepipeline mit einem Fehler.
#' Exit-Code 1 signalisiert dem Backend, dass die Analyse fehlgeschlagen ist.
#' @param message Beschreibung des Fehlers.
#' @param step Optionaler Name des fehlgeschlagenen Verarbeitungsschritts.
#'
#' @return Kein Rückgabewert. Das Skript wird beendet.

exit_with_error <- function(message, step = NULL) {
  log_msg("error", message, step)
  quit(save = "no", status = 1)
}


# ── Eingabeparameter ───

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript run_dmr_analysis.R <beta_rds> <sample_sheet> <job_dir> [minProbes] [cutoff] [adjPVal] [distCutoff]")
}

beta_path <- args[1]
sample_sheet_path <- args[2]
job_dir <- args[3]

# Optionale Parameter (mit Default-Werten)
min_probes  <- ifelse(length(args) >= 4, as.numeric(args[4]), 7)
cutoff      <- ifelse(length(args) >= 5, as.numeric(args[5]), 0.2)
adj_pval    <- ifelse(length(args) >= 6, as.numeric(args[6]), 0.05)
dist_cutoff <- ifelse(length(args) >= 7, as.numeric(args[7]), 500)


if (any(is.na(c(min_probes, cutoff, adj_pval, dist_cutoff)))) {
  exit_with_error("Invalid numeric parameter(s)", "validate_params")
}


# ── Erstellen von Job-Ordner ───

if (!dir.exists(job_dir)) {
  dir.create(job_dir, recursive = TRUE)
}


# ── Beta-Matrix ───

log_msg("running", "Loading beta matrix", "load_beta")

if (!file.exists(beta_path)) {
  exit_with_error("Beta file missing", "load_beta")
}

beta <- readRDS(beta_path)

if (!is.matrix(beta)) {
  exit_with_error("Beta must be matrix", "validate_beta")
}

if (nrow(beta) == 0 || ncol(beta) == 0) {
  exit_with_error("Beta matrix empty", "validate_beta")
}


# ── Sample Sheet ───

log_msg("running", "Loading sample sheet", "load_samples")

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))
samples    <- read_csv(sample_sheet_path, skip = data_start, show_col_types = FALSE)


required <- c("Sample_Name", "Sample_Group")

if (!all(required %in% colnames(samples))) {
  exit_with_error("Sample sheet missing required columns", "validate_samples")
}

pheno <- factor(samples$Sample_Group)

if (length(levels(pheno)) < 2) {
  exit_with_error("At least 2 groups required", "validate_groups")
}


# ── DMR-Analyse ───

log_msg("running", "Running DMR analysis", "dmr")

dmr_raw <- tryCatch({
  
  champ.DMR(
    beta = beta,
    pheno = pheno,
    method = "Bumphunter",
    minProbes = min_probes,
    cutoff = cutoff,
    adjPVal = adj_pval,
    distCutoff = dist_cutoff
  )
  
}, error = function(e) {
  exit_with_error(paste("DMR failed:", e$message), "dmr")
})


# ── Validierung ───

if (is.null(dmr_raw) || nrow(dmr_raw) == 0) {
  exit_with_error("DMR result is empty", "validate_output")
}


# ── Vorbereiten von Tabelle ───

log_msg("running", "Formatting output", "format")

dmr <- data.frame(
  ID = paste0("DMR_", seq_len(nrow(dmr_raw))),
  N_DMPs = dmr_raw$nCpgs,
  CHR = dmr_raw$chr,
  START = dmr_raw$start,
  STOP = dmr_raw$end,
  WIDTH = dmr_raw$width,
  P_VALUE = dmr_raw$p.value,
  MEANDIFF = dmr_raw$meanDiff
)

if (nrow(dmr) == 0) {
  exit_with_error("Formatted DMR table empty", "validate_format")
}


# ── Speichern ───

log_msg("running", "Saving results", "save")

output_csv <- file.path(job_dir, "dmr_results.csv")
output_rds <- file.path(job_dir, "dmr_results.rds")

write.csv(dmr, output_csv, row.names = FALSE)
saveRDS(dmr, output_rds)

log_msg("done", "DMR analysis completed", "complete")

quit(save = "no", status = 0)