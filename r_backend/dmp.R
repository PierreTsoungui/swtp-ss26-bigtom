#' DMP-Analyse
#' 
#' Ausführung:
#' Rscript dmp.R <beta.rds> <sample_sheet.csv> <job_dir>
#' Optional:
#'   <adjPVal> <arraytype>
#'
#' Beispiel:
#' Rscript dmp.R beta.rds samples.csv outdir 0.01 850K


# ── Verwendete Bibliotheken ───

suppressPackageStartupMessages({
  library(ChAMP)
  library(readr)
  library(minfi)
  library(jsonlite)
})


# ── Logging ───

log_msg <- function(status, message, step = NULL) {
  cat(toJSON(list(status = status, step = step, message = message),
             auto_unbox = TRUE), "\n")
}

exit_with_error <- function(message, step = NULL) {
  log_msg("error", message, step)
  quit(save = "no", status = 1)
}


# ── Eingabeparameter ───

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  stop("Usage: Rscript dmp.R <beta.rds> <sample_sheet.csv> <job_dir> [adjPVal] [arraytype]")
}

beta_path         <- args[1]
sample_sheet_path <- args[2]
job_dir           <- args[3]

adjPVal   <- ifelse(length(args) >= 4, as.numeric(args[4]), 0.05)
arraytype <- ifelse(length(args) >= 5, args[5], "450K")


# ── Erstellen von Job-Ordner ───

if (!dir.exists(job_dir)) {
  dir.create(job_dir, recursive = TRUE)
}


# ── Beta-Matrix ───

log_msg("running", "Laden von Beta", "load_beta")

if (!file.exists(beta_path)) {
  exit_with_error("Beta fehlt", "load_beta")
}

beta <- readRDS(beta_path)

if (!is.matrix(beta)) {
  exit_with_error("Beta muss Matrix sein", "validate_beta")
}


# ── Sample Sheet ───

log_msg("running", "Laden von Sample Sheet", "load_samples")

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))
samples    <- read_csv(sample_sheet_path, skip = data_start, show_col_types = FALSE)

required <- c("Sample_Name", "Sample_Group")

if (!all(required %in% colnames(samples))) {
  exit_with_error("Fehlende Spalten", "validate_samples")
}

pheno <- factor(samples$Sample_Group)

if (length(levels(pheno)) != 2) {
  exit_with_error("Genau 2 Gruppen sind notwendig", "validate_groups")
}

group1 <- levels(pheno)[1]
group2 <- levels(pheno)[2]


# ── DMP-Analyse ───

log_msg("running", "DMP-Analyse", "dmp")

dmp_raw <- tryCatch({
  
  champ.DMP(
    beta      = beta,
    pheno     = pheno,
    adjPVal   = 1,        # alles behalten, wir filtern selbst
    arraytype = arraytype
  )
  
}, error = function(e) {
  exit_with_error(e$message, "dmp")
})


# ── Vorbereiten von Tabelle ───

log_msg("running", "Vorbereiten von Output", "format")

comparison_key <- paste0(group1, "_to_", group2)

if (!comparison_key %in% names(dmp_raw)) {
  exit_with_error(
    paste("Vergleichsschlüssel nicht gefunden. Verfügbare Schlüssel:",
          paste(names(dmp_raw), collapse = ", ")),
    "format"
  )
}

dmp_table <- dmp_raw[[comparison_key]]

if (is.null(dmp_table)) {
  exit_with_error(
    paste("dmp_table ist NULL. Verfügbare Schlüssel:",
          paste(names(dmp_raw), collapse = ", ")),
    "format"
  )
}

if (nrow(dmp_table) == 0) {
  exit_with_error(
    paste0("dmp_table ist leer (0 Zeilen). adjPVal = ", adjPVal,
           " möglicherweise zu streng. Versuche einen höheren Wert."),
    "format"
  )
}

eps <- 1e-8

col_group1 <- paste0(group1, "_AVG")
col_group2 <- paste0(group2, "_AVG")

if (!col_group1 %in% colnames(dmp_table) || !col_group2 %in% colnames(dmp_table)) {
  exit_with_error(
    paste("AVG-Spalten nicht gefunden. Verfügbare Spalten:",
          paste(colnames(dmp_table), collapse = ", ")),
    "format"
  )
}

cpg_ids <- if (!is.null(rownames(dmp_table)) && any(nzchar(rownames(dmp_table)))) {
  rownames(dmp_table)
} else {
  dmp_table[[1]]
}

# Für nähere Bedeutung der Spalten: siehe Dateien / Beispieldaten / dmp dmr columns
dmp <- data.frame(
  ID         = cpg_ids,
  CHR        = dmp_table$CHR,
  POS        = dmp_table$MAPINFO,
  GENE       = dmp_table$gene,
  FEATURE    = dmp_table$feature,
  CGI        = dmp_table$cgi,
  ADJ_P      = dmp_table$adj.P.Val,
  GROUP1_AVG = dmp_table[, col_group1],
  GROUP2_AVG = dmp_table[, col_group2],
  DELTA_BETA = dmp_table$deltaBeta,
  LOG_FC     = log2(
    (dmp_table[, col_group2] + eps) /
      (dmp_table[, col_group1] + eps)
  ),
  DMR_ID     = "-"
)

# Eigener adjPVal-Filter
dmp <- dmp[dmp$ADJ_P <= adjPVal, ]


# ── Validierung ───

if (nrow(dmp) == 0) {
  exit_with_error("DMP ist leer", "validate_output")
}


# ── Speichern ───

log_msg("running", "Speichern", "save")

write.csv(dmp, file.path(job_dir, "dmp_results.csv"), row.names = FALSE)
saveRDS(dmp, file.path(job_dir, "dmp_results.rds"))

log_msg("done", "DMP erfolgreich abgeschlossen", "complete")

quit(save = "no", status = 0)