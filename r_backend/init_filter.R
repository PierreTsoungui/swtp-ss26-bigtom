#!/usr/bin/env Rscript
# r_backend/init_filter.R
#
# Aufruf: Rscript init_filter.R <sample_sheet_path> <job_dir>
#
# Aufgaben:
#   1. Samplesheet einlesen (überspringt [Data]-Zeile automatisch)
#   2. IDAT-Dateien laden
#   3. Filterung: Detection P-Value, Bead Count, Non-CpG, SNP, Multi-Hit
#   4. filtered_data.rds + filter_stats.json in job_dir schreiben

suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
})

# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

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

# Samplesheet einlesen – überspringt [Data]-Zeile falls vorhanden
read_samplesheet <- function(path) {
  raw <- readLines(path, warn = FALSE)
  skip_n <- if (grepl("^\\[Data\\]", raw[1])) 1L else 0L
  sheet <- read.csv(path, skip = skip_n, stringsAsFactors = FALSE)
  colnames(sheet) <- trimws(colnames(sheet))
  sheet
}

# Samplesheet → minfi targets (Basename-Spalte aufbauen)
prepare_targets <- function(sheet, job_dir) {

  # Basename bereits vorhanden
  if ("Basename" %in% colnames(sheet)) {
    sheet$Basename <- ifelse(
      startsWith(sheet$Basename, "/"),
      sheet$Basename,
      file.path(job_dir, sheet$Basename)
    )
  } else if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(sheet))) {
    sheet$Basename <- file.path(
      job_dir,
      paste0(sheet$Sentrix_ID, "_", sheet$Sentrix_Position)
    )
  } else {
    # Fallback: IDAT-Dateien im job_dir scannen
    idat_grn <- list.files(job_dir, pattern = "_Grn\\.idat$", full.names = TRUE)
    if (length(idat_grn) == 0) {
      stop("Keine IDAT-Dateien (_Grn.idat) in ", job_dir, " gefunden.")
    }
    basenames <- sub("_Grn\\.idat$", "", idat_grn)
    n <- min(nrow(sheet), length(basenames))
    sheet$Basename <- basenames[seq_len(n)]
    sheet <- sheet[seq_len(n), , drop = FALSE]
    return(sheet)
  }

  # NEU: Nur Samples behalten, deren IDAT-Paare tatsächlich existieren
  grn_exists <- file.exists(paste0(sheet$Basename, "_Grn.idat"))
  red_exists <- file.exists(paste0(sheet$Basename, "_Red.idat"))
  present    <- grn_exists & red_exists

  missing <- sheet$Basename[!present]
  if (length(missing) > 0) {
    warning(
      length(missing), " Sample(s) aus dem Samplesheet fehlen und werden uebersprungen:\n",
      paste(basename(missing), collapse = ", ")
    )
  }

  sheet <- sheet[present, , drop = FALSE]

  if (nrow(sheet) == 0) {
    stop("Keine IDAT-Paare gefunden. Bitte Dateinamen pruefen.")
  }

  sheet
}

# Detection P-Value Filter
filter_detp <- function(raw_data, remove_set) {
  det_p <- detectionP(raw_data)
  failed <- rownames(det_p)[
    apply(det_p, 1, function(x) any(x > 0.01, na.rm = TRUE))
  ]
  union(remove_set, failed)
}

# Bead Count Filter
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

# Non-CpG Filter (auf Beta-Matrix)
filter_non_cpg <- function(beta, ann) {
  if (is.null(ann)) return(beta)
  non_cpg <- rownames(ann)[grepl("^ch\\.", rownames(ann))]
  beta[!rownames(beta) %in% non_cpg, , drop = FALSE]
}

# SNP Filter (auf Beta-Matrix)
filter_snp <- function(beta, ann) {
  if (is.null(ann)) return(beta)
  failed <- rownames(ann)[
    (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= 0.05) |
    (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= 0.05) |
    (!is.na(ann$Probe_maf) & ann$Probe_maf >= 0.05)
  ]
  beta[!rownames(beta) %in% failed, , drop = FALSE]
}

# Multi-Hit Filter (auf Beta-Matrix)
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

# ── Haupt-Filterfunktion ─────────────────────────────────────────────────────

run_filtering <- function(raw_data, job_dir,
                          steps = c("detP", "beadcount", "non_cpg", "snp", "multi_hit")) {

  total_start <- nrow(raw_data)
  cat("Starte Filterung mit", total_start, "Probes\n")
  flush.console()

  filter_stats <- list(total_start = total_start)
  remove_set   <- character(0)

  # 1 Detection P-Value
  if ("detP" %in% steps) {
    emit_progress(30, "Detection P-Value")
    before     <- length(remove_set)
    remove_set <- filter_detp(raw_data, remove_set)
    removed    <- length(remove_set) - before
    filter_stats$detP <- list(removed = removed, after = total_start - length(remove_set))
    emit_progress(35, "Detection P-Value",
                  before = total_start, after = total_start - length(remove_set), removed = removed)
  }

  # 2 Bead Count
  if ("beadcount" %in% steps) {
    emit_progress(40, "Bead Count")
    before     <- length(remove_set)
    remove_set <- filter_beadcount(raw_data, remove_set)
    removed    <- length(remove_set) - before
    filter_stats$beadcount <- list(removed = removed, after = total_start - length(remove_set))
    emit_progress(50, "Bead Count",
                  before = total_start, after = total_start - length(remove_set), removed = removed)
  }

  # Probe-Set auf verbleibende Probes kürzen
  keep <- setdiff(rownames(raw_data), remove_set)
  assert_probes_remain(length(keep), "Pre-QC")
  raw_filtered <- raw_data[keep, ]

  # Preprocessing → Beta-Matrix
  emit_progress(60, "Preprocessing")
  preprocessed <- preprocessRaw(raw_filtered)
  beta         <- getBeta(preprocessed)
  assert_probes_remain(nrow(beta), "Preprocessing")

  ann <- tryCatch(getAnnotation(preprocessed), error = function(e) NULL)

  # 3 Non-CpG
  if ("non_cpg" %in% steps) {
    emit_progress(70, "Non-CpG")
    before <- nrow(beta)
    beta   <- filter_non_cpg(beta, ann)
    assert_probes_remain(nrow(beta), "Non-CpG")
    filter_stats$non_cpg <- list(removed = before - nrow(beta), after = nrow(beta))
    emit_progress(75, "Non-CpG", before = total_start, after = nrow(beta), removed = before - nrow(beta))
  }

  # 4 SNP
  if ("snp" %in% steps) {
    emit_progress(80, "SNP")
    before <- nrow(beta)
    beta   <- filter_snp(beta, ann)
    assert_probes_remain(nrow(beta), "SNP")
    filter_stats$snp <- list(removed = before - nrow(beta), after = nrow(beta))
    emit_progress(85, "SNP", before = total_start, after = nrow(beta), removed = before - nrow(beta))
  }

  # 5 Multi-Hit
  if ("multi_hit" %in% steps) {
    emit_progress(90, "Multi-Hit")
    before <- nrow(beta)
    beta   <- filter_multi_hit(beta, job_dir)
    assert_probes_remain(nrow(beta), "Multi-Hit")
    filter_stats$multi_hit <- list(removed = before - nrow(beta), after = nrow(beta))
    emit_progress(92, "Multi-Hit", before = total_start, after = nrow(beta), removed = before - nrow(beta))
  }

  step_names <- intersect(c("detP", "beadcount", "non_cpg", "snp", "multi_hit"), names(filter_stats))
  steps_list <- lapply(step_names, function(s) {
    list(name = s, removed = filter_stats[[s]]$removed)
  })

  filter_stats_out <- list(
    total_before = total_start,
    steps        = steps_list,
    remaining    = nrow(beta)
  )

  list(beta = beta, filter_stats = filter_stats_out)
}

# ── Entry Point ──────────────────────────────────────────────────────────────

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  cat(toJSON(list(
    progress = 0, step = "FEHLER",
    error = "Aufruf: Rscript init_filter.R <sample_sheet_path> <job_dir>"
  ), auto_unbox = TRUE), "\n")
  quit(status = 1)
}

sample_sheet_path <- args[1]
job_dir           <- args[2]

cat("job_dir:", job_dir, "\n")
cat("sheet:  ", sample_sheet_path, "\n")
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
cat("Spalten:", paste(colnames(sheet), collapse = ", "), "\n")
flush.console()

# 2. Targets vorbereiten
emit_progress(8, "Samplesheet vorbereiten")
targets <- tryCatch(
  prepare_targets(sheet, job_dir),
  error = function(e) {
    cat(toJSON(list(progress = 0, step = "FEHLER", error = conditionMessage(e)), auto_unbox = TRUE), "\n")
    quit(status = 1)
  }
)
cat("Basename-Beispiel:", targets$Basename[1], "\n")
flush.console()

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

# 4. Filterung
result <- tryCatch(
  run_filtering(raw_data, job_dir),
  error = function(e) {
    cat(toJSON(list(progress = 0, step = "FEHLER", error = conditionMessage(e)), auto_unbox = TRUE), "\n")
    quit(status = 1)
  }
)

beta         <- result$beta
filter_stats <- result$filter_stats

# 5. Speichern
emit_progress(95, "Speichern")

rds_path   <- file.path(job_dir, "filtered_data.rds")
stats_path <- file.path(job_dir, "filter_stats.json")

saveRDS(beta, rds_path)
write(toJSON(filter_stats, auto_unbox = TRUE, pretty = TRUE), stats_path)

cat("RDS gespeichert:        ", rds_path, "\n")
cat("Filter-Stats gespeichert:", stats_path, "\n")
flush.console()

emit_progress(100, "DONE",
              before  = filter_stats$total_start,
              after   = filter_stats$total_end,
              removed = filter_stats$total_removed)