#!/usr/bin/env Rscript

#' DMP-Analyse
#'
#' Ausführung:
#' Rscript dmp.R <beta.rds> <sample_sheet.csv> <job_dir> [adjPVal] [arraytype]

# ── Verwendete Bibliotheken ───────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(ChAMP)
  library(readr)
  library(jsonlite)
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
beta_filename     <- args[3]

# FIX: Erkennt flexibel, ob ein absoluter oder relativer Pfad übergeben wurde
beta_path <- if (file.exists(beta_filename)) {
  beta_filename
} else {
  file.path(job_dir, beta_filename)
}

# adjPVal is intentionally NOT used to filter here: the analysis keeps ALL probes
# (champ.DMP runs with adjPVal = 1) and significance is applied later as a table
# filter (TAB-01). The argument is kept for backward compatibility / logging.
adjPVal           <- if (length(args) >= 4) as.numeric(args[4]) else 1.0
arraytype         <- if (length(args) >= 5) args[5]             else "EPICv2"

# Comparison is fully dynamic: the grouping column may have ANY name (not just
# Sample_Group), and the user picks which value is the case and which is the
# control. Δβ is then deterministic: mean(case) − mean(control) (TAB-02).
group_column      <- if (length(args) >= 6 && nzchar(args[6])) args[6] else "Sample_Group"
case_group        <- if (length(args) >= 7 && nzchar(args[7])) args[7] else ""
control_group     <- if (length(args) >= 8 && nzchar(args[8])) args[8] else ""

# Arraytype normalisieren
if (arraytype %in% c("EPIC", "850K")) {
  arraytype <- "EPICv1"
}

if (!arraytype %in% c("EPICv2", "EPICv1", "450K")) {
  emit_error(sprintf("Invalid arraytype provided: '%s'. Allowed values are: EPICv2, EPICv1, 450K", arraytype))
}

if (!dir.exists(job_dir)) {
  dir.create(job_dir, recursive = TRUE)
}

# Initialisierung an Backend melden
emit_progress(0, "Initializing Differential Methylation Probe (DMP) workflow")

# ── Beta-Matrix laden ─────────────────────────────────────────────────────────
emit_progress(15, "Loading and validating methylation beta matrix")

if (!file.exists(beta_path)) {
  emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
}

beta <- readRDS(beta_path)

# S4 minfi-Objekt -> Beta-Matrix extrahieren
if (isS4(beta)) {
  suppressPackageStartupMessages(library(minfi))
  beta <- minfi::getBeta(beta)
}

beta <- as.matrix(beta)

# Schutzschild für batch-korrigierte Daten (Werte auf Intervall [0,1] kappen)
if (any(beta < 0, na.rm = TRUE) || any(beta > 1, na.rm = TRUE)) {
  beta[beta < 0] <- 0
  beta[beta > 1] <- 1
}

if (nrow(beta) == 0 || ncol(beta) == 0) {
  emit_error("Loaded beta matrix is empty (0 features or 0 samples)")
}

# ──────────────────────────────────────────────────────────────────────────────
#  MATHEMATISCHES SCHUTZSCHILD: Invariante & unvollständige Sonden eliminieren
# ──────────────────────────────────────────────────────────────────────────────
row_sds <- apply(beta, 1, sd, na.rm = TRUE)
has_nas  <- apply(beta, 1, anyNA)

# Nur Sonden behalten, die keine NAs enthalten und eine echte Varianz aufweisen
valid_probes <- which(!has_nas & !is.na(row_sds) & row_sds > 1e-5)

if (length(valid_probes) == 0) {
  emit_error("Data anomaly: No valid probes remaining after filtering out invariant or incomplete rows.")
}

beta <- beta[valid_probes, , drop = FALSE]
# ──────────────────────────────────────────────────────────────────────────────

# ── Sample Sheet laden ────────────────────────────────────────────────────────
emit_progress(35, "Loading and parsing sample sheet metadata")

if (!file.exists(sample_sheet_path)) {
  emit_error(sprintf("Sample sheet file not found at path: %s", sample_sheet_path))
}

all_lines  <- readLines(sample_sheet_path)
data_start <- which(grepl("^\\[Data\\]", all_lines))
skip_lines <- if (length(data_start) > 0) data_start[[1]] else 0

samples <- read_csv(sample_sheet_path, skip = skip_lines, show_col_types = FALSE)

required <- c("Sample_Name", "Sample_Group")
if (!all(required %in% colnames(samples))) {
  emit_error(sprintf("Sample sheet is missing mandatory columns. Found: %s", paste(colnames(samples), collapse = ", ")))
}

# ── Robustes Alignment ────────────────────────────────────────────────────────
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

samples_filtered <- samples[samples[[id_col]] %in% beta_samples, , drop = FALSE]
match_idx        <- match(beta_samples, samples_filtered[[id_col]])
samples_aligned  <- samples_filtered[match_idx, , drop = FALSE]

if (nrow(samples_aligned) != ncol(beta)) {
  emit_error("Sample alignment mismatch: Aligned samples count does not match beta matrix columns.")
}

# ── Vergleichsgruppen (dynamische Spalte + Case/Control) ──────────────────────
if (!group_column %in% colnames(samples_aligned)) {
  emit_error(sprintf("Group column '%s' not found in sample sheet.", group_column))
}
group_vec <- as.character(samples_aligned[[group_column]])

# Ohne explizite Wahl: genau zwei Gruppen erwartet (Control = alphabetisch erste).
if (!nzchar(case_group) || !nzchar(control_group)) {
  lv <- sort(unique(group_vec[!is.na(group_vec) & nzchar(group_vec)]))
  if (length(lv) != 2) {
    emit_error(sprintf("Column '%s' has %d usable groups; a case and a control group must be specified.", group_column, length(lv)))
  }
  control_group <- lv[1]
  case_group    <- lv[2]
}

if (case_group == control_group) {
  emit_error("Case and control group must be different.")
}
if (!(case_group %in% group_vec) || !(control_group %in% group_vec)) {
  emit_error(sprintf("Case ('%s') or control ('%s') group not present in column '%s'.", case_group, control_group, group_column))
}

# Auf die zwei gewählten Gruppen reduzieren (Spalte darf mehr Werte haben).
keep      <- group_vec %in% c(case_group, control_group)
beta      <- beta[, keep, drop = FALSE]
group_vec <- group_vec[keep]

# Control als Referenzlevel -> Δβ = mean(Case) − mean(Control), Vorzeichen fix.
pheno  <- factor(group_vec, levels = c(control_group, case_group))
group1 <- case_group     # GROUP1_AVG = Case
group2 <- control_group  # GROUP2_AVG = Control

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
    # Levels-Reihenfolge (Control, Case) bewahren, sonst kippt das Δβ-Vorzeichen.
    pheno <- factor(c(as.character(pheno), g), levels = c(control_group, case_group))
  }
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

# ── Ergebnis extrahieren ──────────────────────────────────────────────────────
emit_progress(85, "Extracting statistical contrasts and computing metrics")

if (is.null(dmp_raw) || length(dmp_raw) == 0) {
  emit_error("Analysis anomaly: champ.DMP returned an empty result object.")
}

comparison_key <- names(dmp_raw)[1]
dmp_table <- dmp_raw[[comparison_key]]

if (is.null(dmp_table) || nrow(dmp_table) == 0) {
  emit_error("DMP extraction failed: Table is empty. Verify that the arraytype matches the dataset architecture.")
}

p_col <- intersect(c("adj.P.Val", "adj.p.val", "P.Value", "p.value"), colnames(dmp_table))[1]

# Gruppen-Mittel & Δβ deterministisch direkt aus der Beta-Matrix berechnen
# (unabhängig von ChAMPs interner, alphabetischer Kontrast-Richtung):
#   GROUP1_AVG = mean(Case), GROUP2_AVG = mean(Control), Δβ = Case − Control.
case_cols <- which(pheno == case_group)
ctrl_cols <- which(pheno == control_group)
case_mean <- rowMeans(beta[, case_cols, drop = FALSE], na.rm = TRUE)
ctrl_mean <- rowMeans(beta[, ctrl_cols, drop = FALSE], na.rm = TRUE)

ids <- rownames(dmp_table)
g1  <- unname(case_mean[ids])   # Case
g2  <- unname(ctrl_mean[ids])   # Control

eps <- 1e-8
dmp <- data.frame(
  ID         = ids,
  CHR        = dmp_table$CHR,
  POS        = dmp_table$MAPINFO,
  GENE       = dmp_table$gene,
  FEATURE    = dmp_table$feature,
  CGI        = dmp_table$cgi,
  ADJ_P      = dmp_table[[p_col]],
  GROUP1_AVG = g1,
  GROUP2_AVG = g2,
  DELTA_BETA = g1 - g2,
  LOG_FC     = log2((g1 + eps) / (g2 + eps)),
  DMR_ID     = "-",
  stringsAsFactors = FALSE
)

# TAB-01: ALLE Sonden behalten (kein harter adjPVal-Cutoff hier). Die Signifikanz-
# Filterung passiert nachgelagert im Tabellen-Filter. Nur Zeilen ohne berechenbare
# Gruppen-Mittel werden entfernt. Eine leere Tabelle ist ein valides Ergebnis.
dmp_filtered <- dmp[!is.na(dmp$GROUP1_AVG) & !is.na(dmp$GROUP2_AVG), ]

# ── DMR-Linking über genomische Position ─────────────────────────────────────
emit_progress(95, "Overlapping found DMPs with genomic DMR region coordinates")

dmr_rds_path <- file.path(job_dir, "dmr_results.rds")

if (file.exists(dmr_rds_path)) {
  dmr_data <- readRDS(dmr_rds_path)
  
  if (!is.null(dmr_data) && nrow(dmr_data) > 0) {
    # Über die (wenigen) DMR-Regionen iterieren und die enthaltenen CpGs
    # vektorisiert markieren. O(#Regionen) statt O(#CpGs × #Regionen) — wichtig,
    # da jetzt ALLE Sonden in der Tabelle stehen (TAB-01).
    chr_v <- as.character(dmp_filtered$CHR)
    pos_v <- as.numeric(dmp_filtered$POS)
    for (j in seq_len(nrow(dmr_data))) {
      in_region <- chr_v == as.character(dmr_data$CHR[j]) &
                   pos_v >= as.numeric(dmr_data$START[j]) &
                   pos_v <= as.numeric(dmr_data$STOP[j])
      dmp_filtered$DMR_ID[in_region] <- as.character(dmr_data$ID[j])
    }
  }
}

# ── Speichern ─────────────────────────────────────────────────────────────────
emit_progress(100, "Saving computed DMP results into pipeline assets")

output_csv <- file.path(job_dir, "dmp_results.csv")
output_rds <- file.path(job_dir, "dmp_results.rds")

write.csv(dmp_filtered, output_csv, row.names = FALSE)
saveRDS(dmp_filtered,   output_rds)

# Finale Erfolgsmeldung an das Backend abgeben
emit_done(
  output_csv = output_csv,
  output_rds = output_rds,
  total_dmps = nrow(dmp_filtered)
)

quit(save = "no", status = 0)