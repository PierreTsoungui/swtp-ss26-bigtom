#!/usr/bin/env Rscript
# r_backend/init_filter.R
#
# Aufruf: Rscript init_filter.R <sample_sheet_path> <job_dir>
#
# Filterparameter werden aus <job_dir>/filter_settings.json gelesen.

Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")

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

emit_error_and_quit <- function(message) {
  cat(toJSON(list(progress = 0, step = "FEHLER", error = message), auto_unbox = TRUE), "\n")
  flush.console()
  quit(status = 1)
}

assert_probes_remain <- function(n, step_name) {
  if (n == 0L) {
    emit_error_and_quit(paste0("Keine Probes nach Schritt '", step_name, "' übrig!"))
  }
}

# ── Filter-Konfiguration ─────────────────────────────────────────────────────

parse_filter_config <- function(json_str) {

  # Defaults — werden überschrieben wenn JSON vorhanden
  cfg <- list(
    det_p          = list(enabled = TRUE,  cutoff = 0.01),
    bead_count     = list(enabled = TRUE,  sample_fraction = 0.05),
    non_cpg        = list(enabled = TRUE),
    snp            = list(enabled = TRUE,  maf = 0.05),
    multi_hit      = list(enabled = TRUE),
    xy_chromosomes = list(enabled = FALSE)
  )

  if (is.null(json_str) || nchar(trimws(json_str)) == 0) {
    cat("[CONFIG] Keine filter_settings.json – verwende Defaults.\n")
    flush.console()
    return(cfg)
  }

  # simplifyVector=TRUE: skalare Typen (TRUE/FALSE, 0.01) bleiben skalare R-Werte.
  # simplifyVector=FALSE würde alles in Listen wickeln, was isTRUE() bricht.
  raw <- tryCatch(
    fromJSON(json_str, simplifyVector = TRUE),
    error = function(e) {
      emit_error_and_quit(paste("Ungültiges filter_settings JSON:", conditionMessage(e)))
    }
  )

  cat("[CONFIG] JSON-Schlüssel:", paste(names(raw), collapse = ", "), "\n")
  flush.console()

  # Jeden Block explizit auflösen.
  # as.logical() stellt sicher dass FALSE/false/"false" alle gleich behandelt werden.

  if (!is.null(raw$det_p)) {
    cfg$det_p$enabled <- isTRUE(as.logical(raw$det_p[["enabled"]]))
    if (!is.null(raw$det_p[["cutoff"]]))
      cfg$det_p$cutoff <- as.numeric(raw$det_p[["cutoff"]])
  }

  if (!is.null(raw$bead_count)) {
    cfg$bead_count$enabled <- isTRUE(as.logical(raw$bead_count[["enabled"]]))
    if (!is.null(raw$bead_count[["sample_fraction"]]))
      cfg$bead_count$sample_fraction <- as.numeric(raw$bead_count[["sample_fraction"]])
  }

  if (!is.null(raw$non_cpg)) {
    cfg$non_cpg$enabled <- isTRUE(as.logical(raw$non_cpg[["enabled"]]))
  }

  if (!is.null(raw$snp)) {
    cfg$snp$enabled <- isTRUE(as.logical(raw$snp[["enabled"]]))
    if (!is.null(raw$snp[["maf"]]))
      cfg$snp$maf <- as.numeric(raw$snp[["maf"]])
  }

  if (!is.null(raw$multi_hit)) {
    cfg$multi_hit$enabled <- isTRUE(as.logical(raw$multi_hit[["enabled"]]))
  }

  if (!is.null(raw$xy_chromosomes)) {
    cfg$xy_chromosomes$enabled <- isTRUE(as.logical(raw$xy_chromosomes[["enabled"]]))
  }

  # Validierung
  if (!is.na(cfg$det_p$cutoff) && (cfg$det_p$cutoff <= 0 || cfg$det_p$cutoff >= 1))
    emit_error_and_quit("det_p.cutoff muss zwischen 0 und 1 liegen.")
  if (!is.na(cfg$snp$maf) && (cfg$snp$maf < 0 || cfg$snp$maf > 1))
    emit_error_and_quit("snp.maf muss zwischen 0 und 1 liegen.")

  # Aufgelöste Konfiguration ausgeben — so sieht man sofort ob die Werte ankamen
  cat(sprintf("[CONFIG] det_p:          enabled=%-5s cutoff=%.4f\n",
              cfg$det_p$enabled, cfg$det_p$cutoff))
  cat(sprintf("[CONFIG] bead_count:     enabled=%-5s sample_fraction=%.4f\n",
              cfg$bead_count$enabled, cfg$bead_count$sample_fraction))
  cat(sprintf("[CONFIG] non_cpg:        enabled=%s\n", cfg$non_cpg$enabled))
  cat(sprintf("[CONFIG] snp:            enabled=%-5s maf=%.4f\n",
              cfg$snp$enabled, cfg$snp$maf))
  cat(sprintf("[CONFIG] multi_hit:      enabled=%s\n", cfg$multi_hit$enabled))
  cat(sprintf("[CONFIG] xy_chromosomes: enabled=%s\n", cfg$xy_chromosomes$enabled))
  flush.console()

  cfg
}

# ── Samplesheet ──────────────────────────────────────────────────────────────

read_samplesheet <- function(path) {
  raw    <- readLines(path, warn = FALSE)
  skip_n <- if (grepl("^\\[Data\\]", raw[1])) 1L else 0L
  sheet  <- read.csv(path, skip = skip_n, stringsAsFactors = FALSE)
  colnames(sheet) <- trimws(colnames(sheet))
  sheet
}

# ── Targets ──────────────────────────────────────────────────────────────────

prepare_targets <- function(sheet, job_dir) {
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
    idat_grn  <- list.files(job_dir, pattern = "_Grn\\.idat$", full.names = TRUE)
    if (length(idat_grn) == 0) emit_error_and_quit("Keine IDAT-Dateien gefunden.")
    basenames <- sub("_Grn\\.idat$", "", idat_grn)
    n         <- min(nrow(sheet), length(basenames))
    sheet$Basename <- basenames[seq_len(n)]
    sheet          <- sheet[seq_len(n), , drop = FALSE]
    return(sheet)
  }

  present <- file.exists(paste0(sheet$Basename, "_Grn.idat")) &
             file.exists(paste0(sheet$Basename, "_Red.idat"))
  sheet   <- sheet[present, , drop = FALSE]

  if (nrow(sheet) == 0) emit_error_and_quit("Keine vollständigen IDAT-Paare gefunden.")
  sheet
}

# ── Filterfunktionen ─────────────────────────────────────────────────────────

filter_detp <- function(raw_data, remove_set, cutoff = 0.01) {
  det_p  <- detectionP(raw_data)
  failed <- rownames(det_p)[
    apply(det_p, 1, function(x) any(x > cutoff, na.rm = TRUE))
  ]
  union(remove_set, failed)
}

filter_beadcount <- function(raw_data, remove_set, sample_fraction = 0.05) {
  tryCatch({
    det_p  <- detectionP(raw_data)
    failed <- rownames(det_p)[
      apply(det_p, 1, function(x) mean(x > 0.01, na.rm = TRUE) > sample_fraction)
    ]
    union(remove_set, failed)
  }, error = function(e) {
    warning("BeadCount fehlgeschlagen: ", conditionMessage(e))
    remove_set
  })
}

filter_non_cpg <- function(rgset, ann) {
  if (is.null(ann)) return(rgset)
  non_cpg <- rownames(ann)[grepl("^ch\\.", rownames(ann))]
  rgset[!rownames(rgset) %in% non_cpg, ]
}

filter_snp <- function(rgset, ann, maf = 0.05) {
  if (is.null(ann)) return(rgset)
  failed <- rownames(ann)[
    (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= maf) |
    (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= maf) |
    (!is.na(ann$Probe_maf) & ann$Probe_maf >= maf)
  ]
  rgset[!rownames(rgset) %in% failed, ]
}

filter_multi_hit <- function(rgset, job_dir) {
  mh_file <- file.path(job_dir, "multi_hit_probes.txt")
  if (!file.exists(mh_file)) {
    message("Multi-Hit-Datei nicht gefunden – Schritt übersprungen.")
    return(rgset)
  }
  mh <- trimws(readLines(mh_file))
  mh <- mh[nchar(mh) > 0]
  rgset[!rownames(rgset) %in% mh, ]
}

filter_xy <- function(rgset, ann) {
  if (is.null(ann)) return(rgset)
  xy_probes <- rownames(ann)[ann$chr %in% c("chrX", "chrY")]
  rgset[!rownames(rgset) %in% xy_probes, ]
}

# ── Haupt-Filterfunktion ─────────────────────────────────────────────────────

run_filtering <- function(raw_data, job_dir, cfg) {

  total_start  <- nrow(raw_data)
  filter_stats <- list(total_start = total_start)
  remove_set   <- character(0)

  cat("Starte Filterung mit", total_start, "Probes\n"); flush.console()

  # ── Detection P-Value ──────────────────────────────────────────────────────
  if (isTRUE(cfg$det_p$enabled)) {
    cat("[FILTER] Detection P-Value AKTIV (cutoff =", cfg$det_p$cutoff, ")\n"); flush.console()
    emit_progress(30, "Detection P-Value")
    before     <- length(remove_set)
    remove_set <- filter_detp(raw_data, remove_set, cutoff = cfg$det_p$cutoff)
    removed    <- length(remove_set) - before
    filter_stats$det_p <- list(
      enabled = TRUE, cutoff = cfg$det_p$cutoff,
      removed = removed, after = total_start - length(remove_set)
    )
    emit_progress(35, "Detection P-Value",
      before = total_start, after = total_start - length(remove_set), removed = removed)
  } else {
    cat("[FILTER] Detection P-Value DEAKTIVIERT\n"); flush.console()
    filter_stats$det_p <- list(enabled = FALSE, removed = 0,
                               after = total_start - length(remove_set))
  }

  # ── Bead Count ─────────────────────────────────────────────────────────────
  if (isTRUE(cfg$bead_count$enabled)) {
    cat("[FILTER] Bead Count AKTIV (sample_fraction =", cfg$bead_count$sample_fraction, ")\n")
    flush.console()
    emit_progress(40, "Bead Count")
    before     <- length(remove_set)
    remove_set <- filter_beadcount(raw_data, remove_set,
                                   sample_fraction = cfg$bead_count$sample_fraction)
    removed    <- length(remove_set) - before
    filter_stats$bead_count <- list(
      enabled = TRUE, sample_fraction = cfg$bead_count$sample_fraction,
      removed = removed, after = total_start - length(remove_set)
    )
    emit_progress(50, "Bead Count",
      before = total_start, after = total_start - length(remove_set), removed = removed)
  } else {
    cat("[FILTER] Bead Count DEAKTIVIERT\n"); flush.console()
    filter_stats$bead_count <- list(enabled = FALSE, removed = 0,
                                    after = total_start - length(remove_set))
  }

  # Gefilterte Probes aus RGChannelSet entfernen
  keep <- setdiff(rownames(raw_data), remove_set)
  assert_probes_remain(length(keep), "Pre-QC")
  raw_filtered <- raw_data[keep, ]

  emit_progress(60, "Annotation laden")
  ann <- tryCatch(getAnnotation(raw_filtered), error = function(e) NULL)

  # ── Non-CpG ────────────────────────────────────────────────────────────────
  if (isTRUE(cfg$non_cpg$enabled)) {
    cat("[FILTER] Non-CpG AKTIV\n"); flush.console()
    before       <- nrow(raw_filtered)
    raw_filtered <- filter_non_cpg(raw_filtered, ann)
    assert_probes_remain(nrow(raw_filtered), "Non-CpG")
    removed <- before - nrow(raw_filtered)
    filter_stats$non_cpg <- list(enabled = TRUE, removed = removed, after = nrow(raw_filtered))
    emit_progress(70, "Non-CpG",
      before = total_start, after = nrow(raw_filtered), removed = removed)
  } else {
    cat("[FILTER] Non-CpG DEAKTIVIERT\n"); flush.console()
    filter_stats$non_cpg <- list(enabled = FALSE, removed = 0, after = nrow(raw_filtered))
  }

  # ── SNP ────────────────────────────────────────────────────────────────────
  if (isTRUE(cfg$snp$enabled)) {
    cat("[FILTER] SNP AKTIV (maf =", cfg$snp$maf, ")\n"); flush.console()
    before       <- nrow(raw_filtered)
    raw_filtered <- filter_snp(raw_filtered, ann, maf = cfg$snp$maf)
    assert_probes_remain(nrow(raw_filtered), "SNP")
    removed <- before - nrow(raw_filtered)
    filter_stats$snp <- list(enabled = TRUE, maf = cfg$snp$maf,
                             removed = removed, after = nrow(raw_filtered))
    emit_progress(80, "SNP",
      before = total_start, after = nrow(raw_filtered), removed = removed)
  } else {
    cat("[FILTER] SNP DEAKTIVIERT\n"); flush.console()
    filter_stats$snp <- list(enabled = FALSE, removed = 0, after = nrow(raw_filtered))
  }

  # ── Multi-Hit ──────────────────────────────────────────────────────────────
  if (isTRUE(cfg$multi_hit$enabled)) {
    cat("[FILTER] Multi-Hit AKTIV\n"); flush.console()
    before       <- nrow(raw_filtered)
    raw_filtered <- filter_multi_hit(raw_filtered, job_dir)
    assert_probes_remain(nrow(raw_filtered), "Multi-Hit")
    removed <- before - nrow(raw_filtered)
    filter_stats$multi_hit <- list(enabled = TRUE, removed = removed, after = nrow(raw_filtered))
    emit_progress(85, "Multi-Hit",
      before = total_start, after = nrow(raw_filtered), removed = removed)
  } else {
    cat("[FILTER] Multi-Hit DEAKTIVIERT\n"); flush.console()
    filter_stats$multi_hit <- list(enabled = FALSE, removed = 0, after = nrow(raw_filtered))
  }

  # ── XY-Chromosomen ─────────────────────────────────────────────────────────
  if (isTRUE(cfg$xy_chromosomes$enabled)) {
    cat("[FILTER] XY-Chromosomen AKTIV\n"); flush.console()
    before       <- nrow(raw_filtered)
    raw_filtered <- filter_xy(raw_filtered, ann)
    assert_probes_remain(nrow(raw_filtered), "XY-Chromosomen")
    removed <- before - nrow(raw_filtered)
    filter_stats$xy_chromosomes <- list(enabled = TRUE, removed = removed,
                                        after = nrow(raw_filtered))
    emit_progress(90, "XY-Chromosomen",
      before = total_start, after = nrow(raw_filtered), removed = removed)
  } else {
    cat("[FILTER] XY-Chromosomen DEAKTIVIERT\n"); flush.console()
    filter_stats$xy_chromosomes <- list(enabled = FALSE, removed = 0,
                                        after = nrow(raw_filtered))
  }

  filter_stats$total_end     <- nrow(raw_filtered)
  filter_stats$total_removed <- total_start - nrow(raw_filtered)

  list(filtered_data = raw_filtered, filter_stats = filter_stats)
}

# ── Entry Point ──────────────────────────────────────────────────────────────

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  emit_error_and_quit("Usage: Rscript init_filter.R <sample_sheet_path> <job_dir>")
}

sample_sheet_path <- args[1]
job_dir           <- args[2]

cat("job_dir:", job_dir, "\n")
cat("sheet:  ", sample_sheet_path, "\n")
flush.console()

# filter_settings.json einlesen
filter_path <- file.path(job_dir, "filter_settings.json")

if (file.exists(filter_path)) {
  cat("[CONFIG] Lese:", filter_path, "\n"); flush.console()
  filter_json <- paste(readLines(filter_path, warn = FALSE), collapse = "\n")
  cat("[CONFIG] Inhalt:\n", filter_json, "\n"); flush.console()
} else {
  cat("[CONFIG] filter_settings.json nicht gefunden unter:", filter_path, "\n")
  cat("[CONFIG] Verwende Defaults.\n"); flush.console()
  filter_json <- NULL
}

# 1. Konfiguration parsen
cfg <- parse_filter_config(filter_json)

# 2. Samplesheet
emit_progress(5, "Samplesheet einlesen")
sheet <- tryCatch(
  read_samplesheet(sample_sheet_path),
  error = function(e) emit_error_and_quit(conditionMessage(e))
)
cat("Spalten:", paste(colnames(sheet), collapse = ", "), "\n"); flush.console()

# 3. Targets
emit_progress(8, "Targets vorbereiten")
targets <- tryCatch(
  prepare_targets(sheet, job_dir),
  error = function(e) emit_error_and_quit(conditionMessage(e))
)
cat("Basename-Beispiel:", targets$Basename[1], "\n"); flush.console()

# 4. IDAT laden
emit_progress(10, "IDAT-Dateien laden")
raw_data <- tryCatch(
  read.metharray.exp(targets = targets, force = TRUE),
  error = function(e) emit_error_and_quit(conditionMessage(e))
)
emit_progress(20, "IDAT-Dateien geladen")
cat("Probes:", nrow(raw_data), "| Samples:", ncol(raw_data), "\n"); flush.console()

# 5. Filterung
result <- tryCatch(
  run_filtering(raw_data, job_dir, cfg),
  error = function(e) emit_error_and_quit(conditionMessage(e))
)

filtered_data <- result$filtered_data
filter_stats  <- result$filter_stats

# 6. Speichern
emit_progress(95, "Speichern")

saveRDS(filtered_data, file.path(job_dir, "filtered_data.rds"))

write(
  toJSON(filter_stats, auto_unbox = TRUE, pretty = TRUE),
  file.path(job_dir, "filter_stats.json")
)

cat("Gespeichert:", job_dir, "\n"); flush.console()

emit_progress(100, "DONE",
  before  = filter_stats$total_start,
  after   = filter_stats$total_end,
  removed = filter_stats$total_removed)

cat("Filtering abgeschlossen\n"); flush.console()