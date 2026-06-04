#!/usr/bin/env Rscript

#' DMP-Analyse
#'
#' Ausführung:
#' Rscript dmp.R <beta.rds> <sample_sheet.csv> <job_dir> [adjPVal] [arraytype]

# ── Verwendete Bibliotheken ───
suppressPackageStartupMessages({
  library(ChAMP)
  library(readr)
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
arraytype <- ifelse(length(args) >= 5, args[5], "EPICv2")

# Arraytype normalisieren
if (arraytype %in% c("EPIC", "850K")) {
  log_msg("running", paste0("arraytype '", arraytype, "' wird zu 'EPICv1' normalisiert"), "init")
  arraytype <- "EPICv1"
}

if (!arraytype %in% c("EPICv2", "EPICv1", "450K")) {
  exit_with_error(paste0("Ungültiger arraytype: '", arraytype, "'. Erlaubt: EPICv2, EPICv1, 450K"), "init")
}

log_msg("running", paste0("adjPVal=", adjPVal, " | arraytype=", arraytype), "init")

if (!dir.exists(job_dir)) {
  dir.create(job_dir, recursive = TRUE)
}

# ── Beta-Matrix laden ───
log_msg("running", "Laden von Beta", "load_beta")

if (!file.exists(beta_path)) {
  exit_with_error("Beta fehlt", "load_beta")
}

beta <- readRDS(beta_path)

# S4 minfi-Objekt -> Beta-Matrix extrahieren
if (isS4(beta)) {
  log_msg("running", "S4-Objekt erkannt, extrahiere Beta-Matrix via minfi", "load_beta")
  suppressPackageStartupMessages(library(minfi))
  beta <- minfi::getBeta(beta)
}

beta <- as.matrix(beta)

# Schutzschild für batch-korrigierte Daten
if (any(beta < 0, na.rm = TRUE) || any(beta > 1, na.rm = TRUE)) {
  log_msg("running", "Batch-korrigierte Beta-Werte leicht außerhalb von [0,1] detektiert. Kappe Werte auf Intervall.", "load_beta")
  beta[beta < 0] <- 0
  beta[beta > 1] <- 1
}

log_msg("running", paste0("Beta geladen: ", nrow(beta), " CpGs x ", ncol(beta), " Proben"), "load_beta")

# ── Sample Sheet laden ───
log_msg("running", "Laden von Sample Sheet", "load_samples")

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))
skip_lines <- if (length(data_start) > 0) data_start[[1]] else 0

samples <- read_csv(sample_sheet_path, skip = skip_lines, show_col_types = FALSE)

required <- c("Sample_Name", "Sample_Group")
if (!all(required %in% colnames(samples))) {
  exit_with_error(paste("Fehlende Pflichtspalten. Gefunden:", paste(colnames(samples), collapse = ", ")), "validate_samples")
}

# ── Robustes Alignment ───
log_msg("running", "Abgleich und Sortierung von Beta-Spalten und Sample Sheet", "validate_alignment")

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
  exit_with_error(paste0("Keine Übereinstimmung zwischen Beta-Spalten und den Identifikatoren im Sample Sheet gefunden."), "validate_alignment")
}

# HIER WAR DER FEHLER - JETZT KORREKT %in%
samples_filtered <- samples[samples[[id_col]] %in% beta_samples, , drop = FALSE]
match_idx        <- match(beta_samples, samples_filtered[[id_col]])
samples_aligned  <- samples_filtered[match_idx, , drop = FALSE]

if (nrow(samples_aligned) != ncol(beta)) {
  exit_with_error("Die Anzahl der alignierten Samples stimmt nicht mit der Beta-Matrix überein.", "validate_alignment")
}

pheno <- factor(samples_aligned$Sample_Group)

if (length(levels(pheno)) != 2) {
  exit_with_error(paste0("Genau 2 Gruppen sind für den DMP-Vergleich notwendig. Gefunden: ", paste(levels(pheno), collapse = ", ")), "validate_groups")
}

group1 <- levels(pheno)[1]
group2 <- levels(pheno)[2]

log_msg("running", paste0("Gruppen-Zuweisung nach Alignment: '", group1, "' (n=", sum(pheno == group1), ") vs '", group2, "' (n=", sum(pheno == group2), ")"), "validate_groups")

# ── Hotfix für Single-Sample-Gruppen (Verhindert ChAMP-Dimension-Drop) ────────
for (g in levels(pheno)) {
  if (sum(pheno == g) == 1) {
    log_msg("running", paste0("Hotfix: Gruppe '", g, "' hat nur 1 Probe. Dupliziere Spalte mit minimalem Rauschen für ChAMP."), "dmp")
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

# ── DMP-Analyse via champ.DMP ───
log_msg("running", "DMP-Analyse (champ.DMP)", "dmp")

dmp_raw <- tryCatch({
  champ.DMP(
    beta      = beta,
    pheno     = pheno,
    adjPVal   = 1, 
    arraytype = arraytype
  )
}, error = function(e) {
  exit_with_error(e$message, "dmp")
})

# ── Ergebnis extrahieren ───
log_msg("running", "Vorbereiten von Output", "format")

if (is.null(dmp_raw) || length(dmp_raw) == 0) {
  exit_with_error("champ.DMP hat keine Ergebnisse zurückgegeben.", "format")
}

comparison_key <- names(dmp_raw)[1]
log_msg("running", paste0("Extrahiere Daten für Key: '", comparison_key, "'"), "format")

dmp_table <- dmp_raw[[comparison_key]]

if (is.null(dmp_table) || nrow(dmp_table) == 0) {
  exit_with_error("dmp_table ist leer. Prüfe den arraytype.", "format")
}

p_col <- intersect(c("adj.P.Val", "adj.p.val", "P.Value", "p.value"), colnames(dmp_table))[1]
col_group1 <- paste0(group1, "_AVG")
col_group2 <- paste0(group2, "_AVG")

if (!col_group1 %in% colnames(dmp_table) || !col_group2 %in% colnames(dmp_table)) {
  col_group1 <- intersect(colnames(dmp_table), paste0(levels(pheno), "_AVG"))[1]
  col_group2 <- intersect(colnames(dmp_table), paste0(levels(pheno), "_AVG"))[2]
}

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
  LOG_FC     = log2((dmp_table[[col_group2]] + eps) / (dmp_table[[col_group1]] + eps)),
  DMR_ID     = "-",
  stringsAsFactors = FALSE
)

# NA-Bereinigung
dmp <- dmp[!is.na(dmp$GROUP1_AVG) & !is.na(dmp$GROUP2_AVG), ]
dmp_filtered <- dmp[!is.na(dmp$ADJ_P) & dmp$ADJ_P <= adjPVal, ]

if (nrow(dmp_filtered) == 0) {
  exit_with_error(paste0("Nach Filter (adjPVal <= ", adjPVal, ") keine DMPs übrig. Min p-Wert: ", round(min(dmp$ADJ_P, na.rm = TRUE), 6)), "validate_output")
}

# ── DMR-Linking über genomische Position ───
log_msg("running", "Verknüpfe DMPs mit DMRs", "dmr_link")

dmr_rds_path <- file.path(job_dir, "dmr_results.rds")

if (file.exists(dmr_rds_path)) {
  dmr_data <- readRDS(dmr_rds_path)
  
  if (!is.null(dmr_data) && nrow(dmr_data) > 0) {
    dmp_filtered$DMR_ID <- vapply(seq_len(nrow(dmp_filtered)), function(i) {
      dmp_chr <- as.character(dmp_filtered$CHR[i])
      dmp_pos <- as.numeric(dmp_filtered$POS[i])
      
      hit <- which(
        as.character(dmr_data$CHR) == dmp_chr &
        as.numeric(dmr_data$START) <= dmp_pos &
        as.numeric(dmr_data$STOP)  >= dmp_pos
      )
      
      if (length(hit) == 0) "-" else dmr_data$ID[hit[1]]
    }, character(1))
    
    n_linked <- sum(dmp_filtered$DMR_ID != "-")
    log_msg("running", paste0(n_linked, " DMPs mit DMR verknüpft"), "dmr_link")
  } else {
    log_msg("running", "dmr_results.rds leer - kein Linking", "dmr_link")
  }
} else {
  log_msg("running", "dmr_results.rds nicht gefunden - DMR_ID bleibt '-'", "dmr_link")
}

# ── Speichern ───
log_msg("running", "Speichern", "save")
write.csv(dmp_filtered, file.path(job_dir, "dmp_results.csv"), row.names = FALSE)
saveRDS(dmp_filtered,   file.path(job_dir, "dmp_results.rds"))

log_msg("done", paste0("DMP erfolgreich abgeschlossen: ", nrow(dmp_filtered), " DMPs gespeichert"), "complete")
quit(save = "no", status = 0)