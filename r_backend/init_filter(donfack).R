#!/usr/bin/env Rscript
# =============================================================================
# Process Methylation Data - Optimierte Pipeline
# =============================================================================
# Aufruf: Rscript process_methylation.R <sample_sheet_path> <job_dir>
#
# Aufgaben:
#   1. Samplesheet einlesen
#   2. IDAT-Dateien laden
#   3. Array-Typ erkennen (EPIC/450k)
#   4. Richtiges Manifest laden
#   5. Filterung: Detection P-Value, Bead Count, Non-CpG, SNP, Multi-Hit
#   6. Ergebnis speichern: filtered_data.rds + filter_stats.json
# =============================================================================

suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
})

# ────────────────────────────────────────────────────────────────────────────
# HILFSFUNKTIONEN
# ────────────────────────────────────────────────────────────────────────────

emit_progress <- function(progress, step, before = NULL, after = NULL, removed = NULL) {
  msg <- list(progress = progress, step = step)
  if (!is.null(before))  msg$before  <- before
  if (!is.null(after))   msg$after   <- after
  if (!is.null(removed)) msg$removed <- removed
  cat(toJSON(msg, auto_unbox = TRUE), "\n")
  flush.console()
}

assert_probes_remain <- function(n, step_name) {
  if (n == 0L) {
    stop("Keine Probes nach Schritt '", step_name, "' übrig! Filterparameter oder Eingabedaten prüfen.")
  }
}

# ────────────────────────────────────────────────────────────────────────────
# SAMPLESHEET EINLESEN
# ────────────────────────────────────────────────────────────────────────────

read_samplesheet <- function(path) {
  # Erster Versuch: als CSV
  if (grepl("\\.csv$", path, ignore.case = TRUE)) {
    raw <- readLines(path, warn = FALSE)
    skip_n <- if (length(raw) > 0 && grepl("^\\[Data\\]", raw[1])) 1L else 0L
    sheet <- read.csv(path, skip = skip_n, stringsAsFactors = FALSE)
  } else {
    # Excel-Datei
    sheet <- readxl::read_excel(path)
    if ("[Data]" %in% sheet[[1]]) {
      start <- which(sheet[[1]] == "[Data]") + 1
      sheet <- read.csv(path, skip = start, stringsAsFactors = FALSE)
    }
  }
  
  colnames(sheet) <- trimws(colnames(sheet))
  
  # Pflichtspalten prüfen
  required <- c("Sentrix_ID", "Sentrix_Position")
  missing <- required[!required %in% colnames(sheet)]
  if (length(missing) > 0) {
    stop("Folgende Pflichtspalten fehlen im Samplesheet: ", paste(missing, collapse = ", "))
  }
  
  sheet
}

# ────────────────────────────────────────────────────────────────────────────
# TARGETS VORBEREITEN (SampleID + Basename)
# ────────────────────────────────────────────────────────────────────────────

prepare_targets <- function(sheet, job_dir) {
  # SampleID aus Sentrix_ID + Sentrix_Position
  sheet$SampleID <- paste0(sheet$Sentrix_ID, "_", sheet$Sentrix_Position)
  
  # IDAT-Dateien im job_dir suchen
  idat_files <- list.files(job_dir, pattern = "\\.idat$", recursive = TRUE, full.names = TRUE)
  
  if (length(idat_files) == 0) {
    stop("Keine IDAT-Dateien (*.idat) in ", job_dir, " gefunden.")
  }
  
  # Nur Grn-Kanal für Basename-Extraktion
  grn_files <- idat_files[grepl("_Grn\\.idat$", idat_files, ignore.case = TRUE)]
  
  # Basename für jedes Sample bestimmen
  sheet$Basename <- sapply(sheet$SampleID, function(id) {
    hit <- grn_files[grepl(id, grn_files, fixed = TRUE)]
    if (length(hit) == 0) return(NA_character_)
    sub("_Grn.*$", "", hit[1], ignore.case = TRUE)
  })
  
  # Ungültige Samples entfernen
  sheet <- sheet[!is.na(sheet$Basename), , drop = FALSE]
  
  if (nrow(sheet) == 0) {
    stop("Keine Samples mit gültigen IDAT-Dateien gefunden.")
  }
  
  cat("Gültige Samples:", nrow(sheet), "\n")
  sheet
}

# ────────────────────────────────────────────────────────────────────────────
# ARRAY-TYP ERKENNEN & MANIFEST LADEN
# ────────────────────────────────────────────────────────────────────────────

load_manifest <- function(raw_data) {
  array_type <- annotation(raw_data)["array"]
  
  cat("Erkannter Array-Typ:", array_type, "\n")
  
  pkg <- switch(array_type,
    "IlluminaHumanMethylationEPIC" = "IlluminaHumanMethylationEPICmanifest",
    "IlluminaHumanMethylationEPICv2" = "IlluminaHumanMethylationEPICv2manifest",
    "IlluminaHumanMethylation450k" = "IlluminaHumanMethylation450kmanifest",
    NULL
  )
  
  if (is.null(pkg)) {
    stop("Unbekannter Array-Typ: ", array_type)
  }
  
  if (!requireNamespace(pkg, quietly = TRUE)) {
    cat("Installiere Manifest-Paket:", pkg, "\n")
    install.packages(pkg, repos = "https://bioconductor.org/packages/3.18/bioc")
  }
  
  library(pkg, character.only = TRUE)
  cat("Manifest geladen:", pkg, "\n")
  
  array_type
}

# ────────────────────────────────────────────────────────────────────────────
# FILTER FUNKTIONEN
# ────────────────────────────────────────────────────────────────────────────

filter_detp <- function(raw_data, remove_set) {
  det_p <- detectionP(raw_data)
  failed <- rownames(det_p)[
    apply(det_p, 1, function(x) any(x > 0.01, na.rm = TRUE))
  ]
  union(remove_set, failed)
}

filter_beadcount <- function(raw_data, remove_set) {
  tryCatch({
    det_p <- detectionP(raw_data)
    failed <- rownames(det_p)[
      apply(det_p, 1, function(x) mean(x > 0.01, na.rm = TRUE) > 0.10)
    ]
    union(remove_set, failed)
  }, error = function(e) {
    warning("BeadCount fehlgeschlagen: ", conditionMessage(e))
    remove_set
  })
}

filter_non_cpg <- function(beta, ann) {
  if (is.null(ann)) return(beta)
  non_cpg <- rownames(ann)[grepl("^ch\\.", rownames(ann))]
  beta[!rownames(beta) %in% non_cpg, , drop = FALSE]
}

filter_snp <- function(beta, ann) {
  if (is.null(ann)) return(beta)
  failed <- rownames(ann)[
    (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= 0.05) |
    (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= 0.05) |
    (!is.na(ann$Probe_maf) & ann$Probe_maf >= 0.05)
  ]
  beta[!rownames(beta) %in% failed, , drop = FALSE]
}

filter_multi_hit <- function(beta, job_dir) {
  mh_file <- file.path(job_dir, "multi_hit_probes.txt")
  if (!file.exists(mh_file)) {
    message("Multi-Hit-Datei nicht gefunden: ", mh_file, " – Schritt übersprungen.")
    return(beta)
  }
  mh <- trimws(readLines(mh_file))
  mh <- mh[nchar(mh) > 0]
  beta[!rownames(beta) %in% mh, , drop = FALSE]
}

# ────────────────────────────────────────────────────────────────────────────
# HAUPT-FILTERUNG
# ────────────────────────────────────────────────────────────────────────────

run_filtering <- function(raw_data, job_dir,
                          steps = c("detP", "beadcount", "non_cpg", "snp", "multi_hit")) {
  
  total_start <- nrow(raw_data)
  cat("Starte Filterung mit", total_start, "Probes\n")
  flush.console()
  
  filter_stats <- list(total_before = total_start)
  remove_set <- character(0)
  
  # 1. Detection P-Value
  if ("detP" %in% steps) {
    emit_progress(30, "Detection P-Value")
    before <- length(remove_set)
    remove_set <- filter_detp(raw_data, remove_set)
    removed <- length(remove_set) - before
    filter_stats$detP <- list(removed = removed, after = total_start - length(remove_set))
    emit_progress(35, "Detection P-Value",
                  before = total_start, after = total_start - length(remove_set), removed = removed)
  }
  
  # 2. Bead Count
  if ("beadcount" %in% steps) {
    emit_progress(40, "Bead Count")
    before <- length(remove_set)
    remove_set <- filter_beadcount(raw_data, remove_set)
    removed <- length(remove_set) - before
    filter_stats$beadcount <- list(removed = removed, after = total_start - length(remove_set))
    emit_progress(50, "Bead Count",
                  before = total_start, after = total_start - length(remove_set), removed = removed)
  }
  
  # 3. Preprocessing
  keep <- setdiff(rownames(raw_data), remove_set)
  assert_probes_remain(length(keep), "Pre-QC")
  raw_filtered <- raw_data[keep, ]
  
  emit_progress(60, "Preprocessing")
  preprocessed <- preprocessRaw(raw_filtered)
  beta <- getBeta(preprocessed)
  assert_probes_remain(nrow(beta), "Preprocessing")
  
  ann <- tryCatch(getAnnotation(preprocessed), error = function(e) NULL)
  
  # 4. Non-CpG
  if ("non_cpg" %in% steps) {
    emit_progress(70, "Non-CpG")
    before <- nrow(beta)
    beta <- filter_non_cpg(beta, ann)
    assert_probes_remain(nrow(beta), "Non-CpG")
    filter_stats$non_cpg <- list(removed = before - nrow(beta), after = nrow(beta))
    emit_progress(75, "Non-CpG", before = total_start, after = nrow(beta), removed = before - nrow(beta))
  }
  
  # 5. SNP
  if ("snp" %in% steps) {
    emit_progress(80, "SNP")
    before <- nrow(beta)
    beta <- filter_snp(beta, ann)
    assert_probes_remain(nrow(beta), "SNP")
    filter_stats$snp <- list(removed = before - nrow(beta), after = nrow(beta))
    emit_progress(85, "SNP", before = total_start, after = nrow(beta), removed = before - nrow(beta))
  }
  
  # 6. Multi-Hit
  if ("multi_hit" %in% steps) {
    emit_progress(90, "Multi-Hit")
    before <- nrow(beta)
    beta <- filter_multi_hit(beta, job_dir)
    assert_probes_remain(nrow(beta), "Multi-Hit")
    filter_stats$multi_hit <- list(removed = before - nrow(beta), after = nrow(beta))
    emit_progress(92, "Multi-Hit", before = total_start, after = nrow(beta), removed = before - nrow(beta))
  }
  
  # Finale Statistik
  steps_list <- lapply(setdiff(names(filter_stats), "total_before"), function(s) {
    list(name = s, removed = filter_stats[[s]]$removed)
  })
  
  filter_stats_out <- list(
    total_before = total_start,
    total_after = nrow(beta),
    total_removed = total_start - nrow(beta),
    steps = steps_list
  )
  
  list(beta = beta, filter_stats = filter_stats_out)
}

# ────────────────────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────────────────────

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  cat(toJSON(list(
    progress = 0, step = "FEHLER",
    error = "Aufruf: Rscript process_methylation.R <sample_sheet_path> <job_dir>"
  ), auto_unbox = TRUE), "\n")
  quit(status = 1)
}

sample_sheet_path <- args[1]
job_dir <- args[2]

cat("Job directory:", job_dir, "\n")
cat("Sample sheet:  ", sample_sheet_path, "\n")
flush.console()

# 1. Samplesheet einlesen
emit_progress(5, "Samplesheet einlesen")
sheet <- tryCatch(
  read_samplesheet(sample_sheet_path),
  error = function(e) {
    cat(toJSON(list(progress = 0, step = "FEHLER", error = conditionMessage(e)), auto_unbox = TRUE), "\n")
    quit(status = 1)
  }
)

# 2. Targets vorbereiten
emit_progress(8, "Samplesheet vorbereiten")
targets <- tryCatch(
  prepare_targets(sheet, job_dir),
  error = function(e) {
    cat(toJSON(list(progress = 0, step = "FEHLER", error = conditionMessage(e)), auto_unbox = TRUE), "\n")
    quit(status = 1)
  }
)

# 3. IDAT laden
emit_progress(10, "IDAT-Dateien laden")
raw_data <- tryCatch(
  read.metharray.exp(targets = targets, force = TRUE),
  error = function(e) {
    cat(toJSON(list(progress = 0, step = "FEHLER", error = conditionMessage(e)), auto_unbox = TRUE), "\n")
    quit(status = 1)
  }
)
emit_progress(20, "IDAT-Dateien geladen")
cat("Probes:", nrow(raw_data), "| Samples:", ncol(raw_data), "\n")
flush.console()

# 4. Array-Typ erkennen & Manifest laden
emit_progress(22, "Array-Typ erkennen")
array_type <- tryCatch(
  load_manifest(raw_data),
  error = function(e) {
    cat(toJSON(list(progress = 0, step = "FEHLER", error = conditionMessage(e)), auto_unbox = TRUE), "\n")
    quit(status = 1)
  }
)

# 5. Filterung
result <- tryCatch(
  run_filtering(raw_data, job_dir),
  error = function(e) {
    cat(toJSON(list(progress = 0, step = "FEHLER", error = conditionMessage(e)), auto_unbox = TRUE), "\n")
    quit(status = 1)
  }
)

beta <- result$beta
filter_stats <- result$filter_stats

# 6. Speichern
emit_progress(95, "Speichern")

rds_path <- file.path(job_dir, "filtered_data.rds")
stats_path <- file.path(job_dir, "filter_stats.json")

saveRDS(beta, rds_path)
write(toJSON(filter_stats, auto_unbox = TRUE, pretty = TRUE), stats_path)

cat("RDS gespeichert:        ", rds_path, "\n")
cat("Filter-Stats gespeichert:", stats_path, "\n")
cat("Verbleibende Probes:    ", filter_stats$total_after, "\n")
flush.console()

emit_progress(100, "FERTIG",
              before = filter_stats$total_before,
              after = filter_stats$total_after,
              removed = filter_stats$total_removed)