#' DMP-Analyse
#'
#' Ausführung:
#' Rscript dmp.R <beta.rds> <sample_sheet.csv> <job_dir>
#' Optional:
#'   <adjPVal> <arraytype>
#'
#' Arraytype-Werte: EPICv2 (Standard), EPICv1, 450K
#' Hinweis: "EPIC" und "850K" werden automatisch zu "EPICv1" normalisiert
#'
#' Beispiel:
#' Rscript dmp.R beta.rds samples.csv outdir 0.05 EPICv2


# ── Verwendete Bibliotheken ───

suppressPackageStartupMessages({
  library(methods) 
  library(DBI)
  library(RSQLite)
  library(lumi)  
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

# ── Arraytype normalisieren ───
#
#  Warum: champ.DMP() akzeptiert intern nur "EPICv2", "EPICv1", "450K".
#  Bei falschem arraytype lädt ChAMP die falsche probe.features-Tabelle
#  (z.B. 450K statt EPICv2) → intersect() der CpG-IDs ist leer
#  → dmp_table hat 0 Zeilen trotz 800k+ gefundener CpGs.
#  "EPIC" / "850K" sind verbreitete Aliase → werden zu "EPICv1" normalisiert.

if (arraytype %in% c("EPIC", "850K")) {
  log_msg("running",
          paste0("arraytype '", arraytype, "' wird zu 'EPICv1' normalisiert"),
          "init")
  arraytype <- "EPICv1"
}

if (!arraytype %in% c("EPICv2", "EPICv1", "450K")) {
  exit_with_error(
    paste0("Ungültiger arraytype: '", arraytype,
           "'. Erlaubt: EPICv2, EPICv1, 450K"),
    "init"
  )
}

log_msg("running",
        paste0("adjPVal=", adjPVal, " | arraytype=", arraytype),
        "init")


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

log_msg("running",
        paste0("Beta geladen: ", nrow(beta), " CpGs x ", ncol(beta), " Proben"),
        "load_beta")


# ── Sample Sheet ───

log_msg("running", "Laden von Sample Sheet", "load_samples")

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))

# [Data] gefunden → eine Zeile darunter beginnt der CSV-Header
# Kein [Data] → direkt von Zeile 1 lesen
skip_lines <- if (length(data_start) > 0) data_start[[1]] else 0

samples <- read_csv(
  sample_sheet_path,
  skip           = skip_lines,
  show_col_types = FALSE
)

log_msg("running",
        paste0("Sample Sheet geladen: ", nrow(samples), " Zeilen | Spalten: ",
               paste(colnames(samples), collapse = ", ")),
        "load_samples")

required <- c("Sample_Name", "Sample_Group")

if (!all(required %in% colnames(samples))) {
  exit_with_error(
    paste("Fehlende Spalten. Gefunden:", paste(colnames(samples), collapse = ", ")),
    "validate_samples"
  )
}

pheno <- factor(samples$Sample_Group)


# ── Abgleich Beta-Spalten vs. Sample Sheet ───

n_beta_cols   <- ncol(beta)
n_sample_rows <- nrow(samples)

log_msg("running",
        paste0("Beta-Spalten: ", n_beta_cols,
               " | Sample-Sheet-Zeilen: ", n_sample_rows),
        "validate_alignment")

if (n_beta_cols != n_sample_rows) {
  exit_with_error(
    paste0("Beta-Spalten (", n_beta_cols, ") stimmen nicht mit ",
           "Sample-Sheet-Zeilen (", n_sample_rows, ") überein. ",
           "Bitte sicherstellen, dass das Sample Sheet genau die Proben ",
           "der Beta-Matrix enthält."),
    "validate_alignment"
  )
}

if (length(levels(pheno)) != 2) {
  exit_with_error(
    paste0("Genau 2 Gruppen sind notwendig. Gefunden: ",
           paste(levels(pheno), collapse = ", ")),
    "validate_groups"
  )
}

group1 <- levels(pheno)[1]
group2 <- levels(pheno)[2]

log_msg("running",
        paste0("Gruppen: '", group1, "' (n=", sum(pheno == group1), ") vs ",
               "'", group2, "' (n=", sum(pheno == group2), ")"),
        "validate_groups")


# ── DMP-Analyse via champ.DMP ───

log_msg("running", "DMP-Analyse (champ.DMP)", "dmp")

dmp_raw <- tryCatch({
  
  champ.DMP(
    beta      = beta,
    pheno     = pheno,
    adjPVal   = 1,          # alles behalten, eigener Filter kommt weiter unten
    arraytype = arraytype   # korrekt: EPICv2 / EPICv1 / 450K
  )
  
}, error = function(e) {
  exit_with_error(e$message, "dmp")
})


# ── Ergebnis aus champ.DMP extrahieren ───

log_msg("running", "Vorbereiten von Output", "format")

comparison_key <- paste0(group1, "_to_", group2)

if (!comparison_key %in% names(dmp_raw)) {
  exit_with_error(
    paste0("Vergleichsschlüssel '", comparison_key, "' nicht gefunden. ",
           "Verfügbare Schlüssel: ", paste(names(dmp_raw), collapse = ", ")),
    "format"
  )
}

dmp_table <- dmp_raw[[comparison_key]]

if (is.null(dmp_table) || nrow(dmp_table) == 0) {
  exit_with_error(
    paste0("dmp_table ist leer. ",
           "Prüfe ob arraytype='", arraytype, "' korrekt ist. ",
           "EPICv2-Daten haben CpG-IDs mit Suffix _BC11/_TC11."),
    "format"
  )
}

log_msg("running",
        paste0("dmp_table: ", nrow(dmp_table), " CpGs | Spalten: ",
               paste(colnames(dmp_table), collapse = ", ")),
        "format")

# P-Wert-Spalte robust finden (champ.DMP liefert "adj.P.Val")
p_col <- intersect(c("adj.P.Val", "adj.p.val", "P.Value", "p.value"),
                   colnames(dmp_table))[1]

if (is.na(p_col)) {
  exit_with_error(
    paste("Keine P-Wert-Spalte gefunden. Verfügbare Spalten:",
          paste(colnames(dmp_table), collapse = ", ")),
    "format"
  )
}

log_msg("running",
        paste0("P-Wert-Spalte: '", p_col, "' | ",
               "Min=", round(min(dmp_table[[p_col]], na.rm = TRUE), 6), " | ",
               "Max=", round(max(dmp_table[[p_col]], na.rm = TRUE), 6)),
        "format")

# AVG-Spalten
col_group1 <- paste0(group1, "_AVG")
col_group2 <- paste0(group2, "_AVG")

if (!col_group1 %in% colnames(dmp_table) || !col_group2 %in% colnames(dmp_table)) {
  exit_with_error(
    paste("AVG-Spalten nicht gefunden. Verfügbare Spalten:",
          paste(colnames(dmp_table), collapse = ", ")),
    "format"
  )
}

# CpG-IDs aus Rownames
cpg_ids <- rownames(dmp_table)

eps <- 1e-8

# Für nähere Bedeutung der Spalten: siehe Dateien / Beispieldaten / dmp dmr columns
dmp <- data.frame(
  ID         = cpg_ids,
  CHR        = dmp_table$CHR,
  POS        = dmp_table$MAPINFO,
  GENE       = dmp_table$gene,
  FEATURE    = dmp_table$feature,
  CGI        = dmp_table$cgi,
  ADJ_P      = dmp_table[[p_col]],
  GROUP1_AVG = dmp_table[[col_group1]],
  GROUP2_AVG = dmp_table[[col_group2]],
  DELTA_BETA = dmp_table$deltaBeta,
  LOG_FC     = log2(
    (dmp_table[[col_group2]] + eps) /
      (dmp_table[[col_group1]] + eps)
  ),
  DMR_ID     = "-",
  stringsAsFactors = FALSE
)

# ── NA-Bereinigung AVG-Spalten ───
#
#  Warum: champ.DMP() kann NA in den Gruppen-Durchschnittsspalten zurückgeben,
#  wenn alle Proben einer Gruppe fehlende Beta-Werte für eine bestimmte Sonde haben.
#  all(x >= 0 & x <= 1) gibt NA zurück (nicht FALSE/TRUE), wenn x NAs enthält,
#  was den Test GROUP1_AVG/GROUP2_AVG im Beta-Bereich [0,1] fehlschlagen lässt.
#  Solche Sonden sind biologisch nicht interpretierbar → werden entfernt.

n_before_na <- nrow(dmp)
dmp <- dmp[!is.na(dmp$GROUP1_AVG) & !is.na(dmp$GROUP2_AVG), ]
n_removed_na <- n_before_na - nrow(dmp)

if (n_removed_na > 0) {
  log_msg("running",
          paste0("NA-Bereinigung: ", n_removed_na,
                 " Sonden mit NA in AVG-Spalten entfernt"),
          "format")
}

# adjPVal-Filter (NAs ausschließen)
dmp_filtered <- dmp[!is.na(dmp$ADJ_P) & dmp$ADJ_P <= adjPVal, ]

log_msg("running",
        paste0("Nach Filter adjPVal <= ", adjPVal, ": ",
               nrow(dmp_filtered), " DMPs"),
        "format")


# ── Validierung ───

if (nrow(dmp_filtered) == 0) {
  exit_with_error(
    paste0("Nach Filter (adjPVal <= ", adjPVal, ") keine DMPs übrig. ",
           "Min adj.P.Val in Daten: ",
           round(min(dmp$ADJ_P, na.rm = TRUE), 6)),
    "validate_output"
  )
}


# ── Speichern ───

log_msg("running", "Speichern", "save")

write.csv(dmp_filtered, file.path(job_dir, "dmp_results.csv"), row.names = FALSE)
saveRDS(dmp_filtered,   file.path(job_dir, "dmp_results.rds"))

log_msg("done",
        paste0("DMP erfolgreich abgeschlossen: ", nrow(dmp_filtered), " DMPs gespeichert"),
        "complete")

quit(save = "no", status = 0)