# =============================================================================
# normalization_preview.R
# =============================================================================
#
# Technische Anmerkung zur Zwei-Datei-Architektur:
#
# Die vier Normalisierungsmethoden akzeptieren nicht denselben Eingabetyp.
# preprocessSWAN() erfordert ein vollständiges, unmodifiziertes RGChannelSet,
# während NOOB, QUANTILE und FUNNORM auf den Daten nach der Filterung
# schlechter Probes arbeiten müssen, um die biologische Validität der
# Ergebnisse sicherzustellen.
#
# Daher werden in init_filter.R zwei Dateien erstellt:
#
#   rg_data.rds      → vollständiges RGChannelSet (vor Filterung) → nur für SWAN
#   filtered_data.rds → gefiltertes RGChannelSet (nach Filterung) → RAW, NOOB,
#                        QUANTILE, FUNNORM
#
# Diese Zwei-Datei-Architektur ist eine technische Notwendigkeit und keine
# willkürliche Entscheidung. Sie ist der einzige Ansatz, der es ermöglicht,
# alle fünf Density Plots korrekt zu generieren, ohne die biologische Qualität
# der normalisierten Daten zu beeinträchtigen.
#
# =============================================================================



#!/usr/bin/env Rscript
# r_backend/init_filter.R

suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
})

# ─────────────────────────────────────────────
# Progress helper
# ─────────────────────────────────────────────

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
    stop("Keine Probes nach Schritt '", step_name, "' übrig!")
  }
}

# ─────────────────────────────────────────────
# Samplesheet
# ─────────────────────────────────────────────

read_samplesheet <- function(path) {
  raw <- readLines(path, warn = FALSE)
  skip_n <- if (length(raw) > 0 && grepl("^\\[Data\\]", raw[1])) 1L else 0L
  sheet <- read.csv(path, skip = skip_n, stringsAsFactors = FALSE)
  colnames(sheet) <- trimws(colnames(sheet))
  sheet
}

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
    idat_grn <- list.files(job_dir, pattern = "_Grn\\.idat$", full.names = TRUE)
    if (length(idat_grn) == 0) stop("No IDAT files found")

    basenames <- sub("_Grn\\.idat$", "", idat_grn)
    n <- min(nrow(sheet), length(basenames))
    sheet$Basename <- basenames[seq_len(n)]
    sheet <- sheet[seq_len(n), , drop = FALSE]
  }

  grn_exists <- file.exists(paste0(sheet$Basename, "_Grn.idat"))
  red_exists <- file.exists(paste0(sheet$Basename, "_Red.idat"))
  sheet <- sheet[grn_exists & red_exists, , drop = FALSE]

  if (nrow(sheet) == 0) {
    stop("No valid IDAT pairs found")
  }

  sheet
}

# ─────────────────────────────────────────────
# Filters
# ─────────────────────────────────────────────

filter_detp <- function(raw_data, remove_set) {
  det_p <- detectionP(raw_data)
  failed <- rownames(det_p)[apply(det_p, 1, function(x) any(x > 0.01, na.rm = TRUE))]
  union(remove_set, failed)
}

filter_beadcount <- function(raw_data, remove_set) {
  tryCatch({
    det_p <- detectionP(raw_data)
    failed <- rownames(det_p)[apply(det_p, 1, function(x) mean(x > 0.01, na.rm = TRUE) > 0.10)]
    union(remove_set, failed)
  }, error = function(e) remove_set)
}

# ─────────────────────────────────────────────
# MAIN FILTERING
# ─────────────────────────────────────────────

run_filtering <- function(raw_data, job_dir,
                          steps = c("detP", "beadcount")) {

  total_start <- nrow(raw_data)
  emit_progress(20, "Filtering start")

  remove_set <- character(0)

  # 1 detP
  if ("detP" %in% steps) {
    before <- length(remove_set)
    remove_set <- filter_detp(raw_data, remove_set)

    emit_progress(
      35, "detP",
      before = total_start,
      after  = total_start - length(remove_set),
      removed = length(remove_set) - before
    )
  }

  # 2 beadcount
  if ("beadcount" %in% steps) {
    before <- length(remove_set)
    remove_set <- filter_beadcount(raw_data, remove_set)

    emit_progress(
      50, "beadcount",
      before  = total_start,
      after   = total_start - length(remove_set),
      removed = length(remove_set) - before
    )
  }

  keep <- setdiff(rownames(raw_data), remove_set)
  assert_probes_remain(length(keep), "Pre-QC")

  raw_filtered <- raw_data[keep, ]

  emit_progress(60, "filtered_ready")

  list(filtered = raw_filtered)
}

# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop("Usage: Rscript init_filter.R <sample_sheet> <job_dir>")
}

sample_sheet_path <- args[1]
job_dir           <- args[2]

emit_progress(5,  "read_samplesheet")
sheet <- read_samplesheet(sample_sheet_path)

emit_progress(10, "prepare_targets")
targets <- prepare_targets(sheet, job_dir)

emit_progress(15, "load_idat")
raw_data <- read.metharray.exp(targets = targets, force = TRUE)
emit_progress(20, "idat_loaded")

# ─────────────────────────────────────────────
# SAVE RGChannelSet AVANT filtrage (pour SWAN)
# ─────────────────────────────────────────────
emit_progress(22, "saving_rgset")
saveRDS(raw_data, file.path(job_dir, "rg_data.rds"))  # raw_data EST le RGChannelSet ici

# ─────────────────────────────────────────────
# FILTERING
# ─────────────────────────────────────────────
result <- run_filtering(raw_data, job_dir)

# ─────────────────────────────────────────────
# SAVE OUTPUT
# ─────────────────────────────────────────────
emit_progress(95, "saving")

rds_path   <- file.path(job_dir, "filtered_data.rds")
stats_path <- file.path(job_dir, "filter_stats.json")

saveRDS(result$filtered, rds_path)

write(
  toJSON(list(status = "ok"), auto_unbox = TRUE, pretty = TRUE),
  stats_path
)

emit_progress(100, "done")