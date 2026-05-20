#!/usr/bin/env Rscript
# r_backend/init_filter.R
#
# AUFGABEN
#   1. Samplesheet einlesen
#   2. IDAT-Dateien laden
#   3. Probe-Filtering auf RGChannelSet
#   4. GEFILTERTES RGChannelSet speichern
#   5. Filter-Statistik speichern
#
# WICHTIGE ÄNDERUNG:
# -------------------
# ALT:
#   preprocessRaw() + getBeta()
#   => hat eine Beta-Matrix gespeichert
#
# PROBLEM:
#   FUNNORM / NOOB / SWAN brauchen RGChannelSet
#
# NEU:
#   Wir speichern das GEFILTERTE RGChannelSet
#   => normalization_preview.R funktioniert korrekt
#

Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")

suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
})

# ------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------

emit_progress <- function(progress, step, before = NULL, after = NULL, removed = NULL) {

  msg <- list(
    progress = progress,
    step = step
  )

  if (!is.null(before))  msg$before  <- before
  if (!is.null(after))   msg$after   <- after
  if (!is.null(removed)) msg$removed <- removed

  cat(toJSON(msg, auto_unbox = TRUE), "\n")
  flush.console()
}

assert_probes_remain <- function(n, step_name) {

  if (n == 0L) {
    stop(
      "Keine Probes nach Schritt '",
      step_name,
      "' übrig!"
    )
  }
}

# ------------------------------------------------------------
# SAMPLE SHEET
# ------------------------------------------------------------

read_samplesheet <- function(path) {

  raw <- readLines(path, warn = FALSE)

  skip_n <- if (
    grepl("^\\[Data\\]", raw[1])
  ) 1L else 0L

  sheet <- read.csv(
    path,
    skip = skip_n,
    stringsAsFactors = FALSE
  )

  colnames(sheet) <- trimws(colnames(sheet))

  sheet
}

# ------------------------------------------------------------
# TARGETS
# ------------------------------------------------------------

prepare_targets <- function(sheet, job_dir) {

  # Basename bereits vorhanden
  if ("Basename" %in% colnames(sheet)) {

    sheet$Basename <- ifelse(
      startsWith(sheet$Basename, "/"),
      sheet$Basename,
      file.path(job_dir, sheet$Basename)
    )

  } else if (
    all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(sheet))
  ) {

    sheet$Basename <- file.path(
      job_dir,
      paste0(
        sheet$Sentrix_ID,
        "_",
        sheet$Sentrix_Position
      )
    )

  } else {

    idat_grn <- list.files(
      job_dir,
      pattern = "_Grn\\.idat$",
      full.names = TRUE
    )

    if (length(idat_grn) == 0) {
      stop("Keine IDAT-Dateien gefunden.")
    }

    basenames <- sub("_Grn\\.idat$", "", idat_grn)

    n <- min(nrow(sheet), length(basenames))

    sheet$Basename <- basenames[seq_len(n)]

    sheet <- sheet[seq_len(n), , drop = FALSE]

    return(sheet)
  }

  # Nur vorhandene IDAT-Paare behalten
  grn_exists <- file.exists(paste0(sheet$Basename, "_Grn.idat"))
  red_exists <- file.exists(paste0(sheet$Basename, "_Red.idat"))

  present <- grn_exists & red_exists

  sheet <- sheet[present, , drop = FALSE]

  if (nrow(sheet) == 0) {
    stop("Keine vollständigen IDAT-Paare gefunden.")
  }

  sheet
}

# ------------------------------------------------------------
# DETECTION P FILTER
# ------------------------------------------------------------

filter_detp <- function(raw_data, remove_set) {

  det_p <- detectionP(raw_data)

  failed <- rownames(det_p)[
    apply(det_p, 1, function(x) {
      any(x > 0.01, na.rm = TRUE)
    })
  ]

  union(remove_set, failed)
}

# ------------------------------------------------------------
# BEAD COUNT
# ------------------------------------------------------------

filter_beadcount <- function(raw_data, remove_set) {

  tryCatch({

    det_p <- detectionP(raw_data)

    failed <- rownames(det_p)[
      apply(det_p, 1, function(x) {
        mean(x > 0.01, na.rm = TRUE) > 0.10
      })
    ]

    union(remove_set, failed)

  }, error = function(e) {

    warning("BeadCount fehlgeschlagen")

    remove_set
  })
}

# ------------------------------------------------------------
# NON-CpG
#
# GEÄNDERT:
# ----------
# ALT:
#   Funktion arbeitete auf Beta-Matrix
#
# NEU:
#   Funktion arbeitet direkt auf RGChannelSet
# ------------------------------------------------------------

filter_non_cpg <- function(rgset, ann) {

  if (is.null(ann)) {
    return(rgset)
  }

  non_cpg <- rownames(ann)[
    grepl("^ch\\.", rownames(ann))
  ]

  keep <- !rownames(rgset) %in% non_cpg

  rgset[keep, ]
}

# ------------------------------------------------------------
# SNP FILTER
#
# GEÄNDERT:
# ----------
# arbeitet jetzt auf RGChannelSet
# ------------------------------------------------------------

filter_snp <- function(rgset, ann) {

  if (is.null(ann)) {
    return(rgset)
  }

  failed <- rownames(ann)[
    (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= 0.05) |
    (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= 0.05) |
    (!is.na(ann$Probe_maf) & ann$Probe_maf >= 0.05)
  ]

  keep <- !rownames(rgset) %in% failed

  rgset[keep, ]
}

# ------------------------------------------------------------
# MULTI HIT
#
# GEÄNDERT:
# ----------
# arbeitet jetzt auf RGChannelSet
# ------------------------------------------------------------

filter_multi_hit <- function(rgset, job_dir) {

  mh_file <- file.path(
    job_dir,
    "multi_hit_probes.txt"
  )

  if (!file.exists(mh_file)) {
    return(rgset)
  }

  mh <- trimws(readLines(mh_file))
  mh <- mh[nchar(mh) > 0]

  keep <- !rownames(rgset) %in% mh

  rgset[keep, ]
}

# ------------------------------------------------------------
# MAIN FILTERING
# ------------------------------------------------------------

run_filtering <- function(
  raw_data,
  job_dir,
  steps = c(
    "detP",
    "beadcount",
    "non_cpg",
    "snp",
    "multi_hit"
  )
) {

  total_start <- nrow(raw_data)

  filter_stats <- list(
    total_start = total_start
  )

  remove_set <- character(0)

  # --------------------------------------------------------
  # Detection P
  # --------------------------------------------------------

  if ("detP" %in% steps) {

    emit_progress(30, "Detection P-Value")

    before <- length(remove_set)

    remove_set <- filter_detp(
      raw_data,
      remove_set
    )

    removed <- length(remove_set) - before

    filter_stats$detP <- list(
      removed = removed,
      after = total_start - length(remove_set)
    )
  }

  # --------------------------------------------------------
  # Bead Count
  # --------------------------------------------------------

  if ("beadcount" %in% steps) {

    emit_progress(40, "Bead Count")

    before <- length(remove_set)

    remove_set <- filter_beadcount(
      raw_data,
      remove_set
    )

    removed <- length(remove_set) - before

    filter_stats$beadcount <- list(
      removed = removed,
      after = total_start - length(remove_set)
    )
  }

  # --------------------------------------------------------
  # REMOVE FAILED PROBES
  # --------------------------------------------------------

  keep <- setdiff(
    rownames(raw_data),
    remove_set
  )

  assert_probes_remain(
    length(keep),
    "Pre-QC"
  )

  raw_filtered <- raw_data[keep, ]

  # --------------------------------------------------------
  # GEÄNDERT
  #
  # ALT:
  #   preprocessRaw()
  #   getBeta()
  #
  # PROBLEM:
  #   RGChannelSet ging verloren
  #
  # NEU:
  #   Wir behalten raw_filtered als RGChannelSet
  # --------------------------------------------------------

  emit_progress(60, "Annotation vorbereiten")

  ann <- tryCatch(
    getAnnotation(raw_filtered),
    error = function(e) NULL
  )

  # --------------------------------------------------------
  # Non-CpG
  # --------------------------------------------------------

  if ("non_cpg" %in% steps) {

    before <- nrow(raw_filtered)

    raw_filtered <- filter_non_cpg(
      raw_filtered,
      ann
    )

    after <- nrow(raw_filtered)

    assert_probes_remain(
      after,
      "Non-CpG"
    )

    filter_stats$non_cpg <- list(
      removed = before - after,
      after = after
    )
  }

  # --------------------------------------------------------
  # SNP
  # --------------------------------------------------------

  if ("snp" %in% steps) {

    before <- nrow(raw_filtered)

    raw_filtered <- filter_snp(
      raw_filtered,
      ann
    )

    after <- nrow(raw_filtered)

    assert_probes_remain(
      after,
      "SNP"
    )

    filter_stats$snp <- list(
      removed = before - after,
      after = after
    )
  }

  # --------------------------------------------------------
  # MULTI HIT
  # --------------------------------------------------------

  if ("multi_hit" %in% steps) {

    before <- nrow(raw_filtered)

    raw_filtered <- filter_multi_hit(
      raw_filtered,
      job_dir
    )

    after <- nrow(raw_filtered)

    assert_probes_remain(
      after,
      "Multi-Hit"
    )

    filter_stats$multi_hit <- list(
      removed = before - after,
      after = after
    )
  }

  # --------------------------------------------------------
  # OUTPUT STATS
  # --------------------------------------------------------

  step_names <- intersect(
    c(
      "detP",
      "beadcount",
      "non_cpg",
      "snp",
      "multi_hit"
    ),
    names(filter_stats)
  )

  steps_list <- lapply(step_names, function(s) {

    list(
      name = s,
      removed = filter_stats[[s]]$removed
    )
  })

  filter_stats_out <- list(
    total_before = total_start,
    steps = steps_list,
    remaining = nrow(raw_filtered)
  )

  # --------------------------------------------------------
  # GEÄNDERT
  #
  # ALT:
  #   beta zurückgegeben
  #
  # NEU:
  #   RGChannelSet zurückgeben
  # --------------------------------------------------------

  list(
    filtered_data = raw_filtered,
    filter_stats = filter_stats_out
  )
}

# ------------------------------------------------------------
# ENTRY POINT
# ------------------------------------------------------------

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {

  cat(
    toJSON(
      list(
        progress = 0,
        step = "FEHLER",
        error = "Usage: init_filter.R <sheet> <job_dir>"
      ),
      auto_unbox = TRUE
    ),
    "\n"
  )

  quit(status = 1)
}

sample_sheet_path <- args[1]
job_dir <- args[2]

# ------------------------------------------------------------
# LOAD SHEET
# ------------------------------------------------------------

emit_progress(5, "Samplesheet einlesen")

sheet <- read_samplesheet(sample_sheet_path)

# ------------------------------------------------------------
# TARGETS
# ------------------------------------------------------------

emit_progress(8, "Targets vorbereiten")

targets <- prepare_targets(
  sheet,
  job_dir
)

# ------------------------------------------------------------
# LOAD IDAT
# ------------------------------------------------------------

emit_progress(10, "IDAT laden")

raw_data <- read.metharray.exp(
  targets = targets,
  force = TRUE
)

emit_progress(20, "IDAT geladen")

# ------------------------------------------------------------
# FILTERING
# ------------------------------------------------------------

result <- run_filtering(
  raw_data,
  job_dir
)

# ------------------------------------------------------------
# GEÄNDERT
#
# ALT:
#   beta <- result$beta
#
# NEU:
#   filtered_data <- result$filtered_data
# ------------------------------------------------------------

filtered_data <- result$filtered_data
filter_stats  <- result$filter_stats

# ------------------------------------------------------------
# SAVE
# ------------------------------------------------------------

emit_progress(95, "Speichern")

rds_path <- file.path(
  job_dir,
  "filtered_data.rds"
)

stats_path <- file.path(
  job_dir,
  "filter_stats.json"
)

# ------------------------------------------------------------
# GEÄNDERT
#
# ALT:
#   saveRDS(beta)
#
# NEU:
#   saveRDS(RGChannelSet)
# ------------------------------------------------------------

saveRDS(filtered_data, rds_path)

write(
  toJSON(
    filter_stats,
    auto_unbox = TRUE,
    pretty = TRUE
  ),
  stats_path
)

emit_progress(100, "DONE")

cat("Filtering abgeschlossen\n")
flush.console()