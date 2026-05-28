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

  cfg <- list(
    det_p          = list(enabled = FALSE, cutoff = 0.01),
    bead_count     = list(enabled = FALSE, bead_cutoff = 0.05),
    non_cpg        = list(enabled = FALSE),
    snp            = list(enabled = FALSE, maf_cutoff = 0.05),
    multi_hit      = list(enabled = FALSE),
    xy_chromosomes = list(enabled = FALSE),
    sample_quality = list(
      enabled                    = FALSE,
      detection_p_cutoff         = 0.01,
      sample_failure_rate        = 0.10,
      remove_failed_samples      = TRUE,
      enable_pca_outlier_detection = TRUE
    )
  )

  if (is.null(json_str) || nchar(trimws(json_str)) == 0) {
    cat("[CONFIG] Keine filter_settings.json – verwende Defaults.\n")
    flush.console()
    return(cfg)
  }

  raw <- tryCatch(
    fromJSON(json_str, simplifyVector = TRUE),
    error = function(e) {
      emit_error_and_quit(paste("Ungültiges filter_settings JSON:", conditionMessage(e)))
    }
  )

  cat("[CONFIG] JSON-Schlüssel:", paste(names(raw), collapse = ", "), "\n")
  flush.console()

  if (!is.null(raw$det_p)) {
    cfg$det_p$enabled <- isTRUE(as.logical(raw$det_p[["enabled"]]))
    if (!is.null(raw$det_p[["cutoff"]]))
      cfg$det_p$cutoff <- as.numeric(raw$det_p[["cutoff"]])
  }

  if (!is.null(raw$bead_count)) {
    cfg$bead_count$enabled <- isTRUE(as.logical(raw$bead_count[["enabled"]]))
    if (!is.null(raw$bead_count[["bead_cutoff"]]))
      cfg$bead_count$bead_cutoff <- as.numeric(raw$bead_count[["bead_cutoff"]])
  }

  if (!is.null(raw$non_cpg)) {
    cfg$non_cpg$enabled <- isTRUE(as.logical(raw$non_cpg[["enabled"]]))
  }

  if (!is.null(raw$snp)) {
    cfg$snp$enabled <- isTRUE(as.logical(raw$snp[["enabled"]]))
    if (!is.null(raw$snp[["maf_cutoff"]]))
      cfg$snp$maf_cutoff <- as.numeric(raw$snp[["maf_cutoff"]])
  }

  if (!is.null(raw$multi_hit)) {
    cfg$multi_hit$enabled <- isTRUE(as.logical(raw$multi_hit[["enabled"]]))
  }

  if (!is.null(raw$xy_chromosomes)) {
    cfg$xy_chromosomes$enabled <- isTRUE(as.logical(raw$xy_chromosomes[["enabled"]]))
  }

  if (!is.null(raw$sample_quality)) {
    cfg$sample_quality$enabled <- isTRUE(as.logical(raw$sample_quality[["enabled"]]))
    if (!is.null(raw$sample_quality[["detection_p_cutoff"]]))
      cfg$sample_quality$detection_p_cutoff <- as.numeric(raw$sample_quality[["detection_p_cutoff"]])
    if (!is.null(raw$sample_quality[["sample_failure_rate"]]))
      cfg$sample_quality$sample_failure_rate <- as.numeric(raw$sample_quality[["sample_failure_rate"]])
    if (!is.null(raw$sample_quality[["remove_failed_samples"]]))
      cfg$sample_quality$remove_failed_samples <- isTRUE(as.logical(raw$sample_quality[["remove_failed_samples"]]))
    if (!is.null(raw$sample_quality[["enable_pca_outlier_detection"]]))
      cfg$sample_quality$enable_pca_outlier_detection <- isTRUE(as.logical(raw$sample_quality[["enable_pca_outlier_detection"]]))
  }

  # Validierung
  if (!is.na(cfg$det_p$cutoff) && (cfg$det_p$cutoff < 0.01 || cfg$det_p$cutoff > 0.05))
    emit_error_and_quit("det_p.cutoff muss zwischen 0.01 und 0.05 liegen.")
  if (!is.na(cfg$bead_count$bead_cutoff) && (cfg$bead_count$bead_cutoff < 0.01 || cfg$bead_count$bead_cutoff > 0.1))
    emit_error_and_quit("bead_count.bead_cutoff muss zwischen 0.01 und 0.1 liegen.")
  if (!is.na(cfg$snp$maf_cutoff) && (cfg$snp$maf_cutoff < 0.01 || cfg$snp$maf_cutoff > 0.1))
    emit_error_and_quit("snp.maf_cutoff muss zwischen 0.01 und 0.1 liegen.")
  if (!is.na(cfg$sample_quality$detection_p_cutoff) &&
      (cfg$sample_quality$detection_p_cutoff < 0.01 || cfg$sample_quality$detection_p_cutoff > 0.05))
    emit_error_and_quit("sample_quality.detection_p_cutoff muss zwischen 0.01 und 0.05 liegen.")
  if (!is.na(cfg$sample_quality$sample_failure_rate) &&
      (cfg$sample_quality$sample_failure_rate < 0.05 || cfg$sample_quality$sample_failure_rate > 0.2))
    emit_error_and_quit("sample_quality.sample_failure_rate muss zwischen 0.05 und 0.2 liegen.")

  cat(sprintf("[CONFIG] det_p:          enabled=%-5s cutoff=%.4f\n",
              cfg$det_p$enabled, cfg$det_p$cutoff))
  cat(sprintf("[CONFIG] bead_count:     enabled=%-5s bead_cutoff=%.4f\n",
              cfg$bead_count$enabled, cfg$bead_count$bead_cutoff))
  cat(sprintf("[CONFIG] non_cpg:        enabled=%s\n", cfg$non_cpg$enabled))
  cat(sprintf("[CONFIG] snp:            enabled=%-5s maf_cutoff=%.4f\n",
              cfg$snp$enabled, cfg$snp$maf_cutoff))
  cat(sprintf("[CONFIG] multi_hit:      enabled=%s\n", cfg$multi_hit$enabled))
  cat(sprintf("[CONFIG] xy_chromosomes: enabled=%s\n", cfg$xy_chromosomes$enabled))
  cat(sprintf("[CONFIG] sample_quality: enabled=%-5s detection_p_cutoff=%.4f sample_failure_rate=%.4f remove_failed=%s pca_outlier=%s\n",
              cfg$sample_quality$enabled,
              cfg$sample_quality$detection_p_cutoff,
              cfg$sample_quality$sample_failure_rate,
              cfg$sample_quality$remove_failed_samples,
              cfg$sample_quality$enable_pca_outlier_detection))
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

filter_detp <- function(det_p, remove_set, cutoff = 0.01) {
  if (is.null(det_p)) return(remove_set)
  failed <- rownames(det_p)[
    apply(det_p, 1, function(x) any(x > cutoff, na.rm = TRUE))
  ]
  union(remove_set, failed)
}

filter_beadcount <- function(det_p, remove_set, bead_cutoff = 0.05) {
  if (is.null(det_p)) return(remove_set)
  tryCatch({
    failed <- rownames(det_p)[
      apply(det_p, 1, function(x) mean(x > 0.01, na.rm = TRUE) > bead_cutoff)
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

filter_snp <- function(rgset, ann, maf_cutoff = 0.05) {
  if (is.null(ann)) return(rgset)
  failed <- rownames(ann)[
    (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= maf_cutoff) |
    (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= maf_cutoff) |
    (!is.na(ann$Probe_maf) & ann$Probe_maf >= maf_cutoff)
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

filter_sample_quality <- function(raw_data, cfg_sq) {
  # Gibt eine Liste zurück: $rgset (gefiltertes RGChannelSet), $removed_samples (Vektor)
  removed_samples <- character(0)

  det_p <- tryCatch(detectionP(raw_data), error = function(e) NULL)

  if (is.null(det_p)) {
    warning("Sample Quality Filter: Detection-P-Werte konnten nicht berechnet werden.")
    return(list(rgset = raw_data, removed_samples = removed_samples))
  }

  # Schritt 1: Samples mit zu hoher Probe-Fehlerrate entfernen
  if (isTRUE(cfg_sq$remove_failed_samples)) {
    failure_rates <- colMeans(det_p > cfg_sq$detection_p_cutoff, na.rm = TRUE)
    bad_samples   <- names(failure_rates)[failure_rates > cfg_sq$sample_failure_rate]

    if (length(bad_samples) > 0) {
      cat(sprintf("[SAMPLE QC] Entferne %d Sample(s) wegen hoher Fehlerrate: %s\n",
                  length(bad_samples), paste(bad_samples, collapse = ", ")))
      flush.console()
      removed_samples <- union(removed_samples, bad_samples)
    }
  }

  # Schritt 2: PCA-basierte Ausreißererkennung
  if (isTRUE(cfg_sq$enable_pca_outlier_detection)) {
    tryCatch({
      beta_mat <- getBeta(raw_data)

      # Nur Samples behalten, die noch nicht entfernt wurden
      keep_cols <- setdiff(colnames(beta_mat), removed_samples)
      if (length(keep_cols) >= 3) {
        beta_sub  <- beta_mat[, keep_cols, drop = FALSE]

        # Zeilen mit NA entfernen für PCA
        beta_complete <- beta_sub[complete.cases(beta_sub), ]

        if (nrow(beta_complete) > 10) {
          pca_res <- prcomp(t(beta_complete), center = TRUE, scale. = FALSE)
          scores  <- pca_res$x[, 1:min(2, ncol(pca_res$x)), drop = FALSE]

          # Mahalanobis-Distanz für Ausreißer
          center  <- colMeans(scores)
          cov_mat <- cov(scores)

          if (det(cov_mat) > 1e-10) {
            distances   <- mahalanobis(scores, center, cov_mat)
            threshold   <- qchisq(0.975, df = ncol(scores))
            outliers    <- rownames(scores)[distances > threshold]

            if (length(outliers) > 0) {
              cat(sprintf("[SAMPLE QC] PCA-Ausreißer erkannt (%d): %s\n",
                          length(outliers), paste(outliers, collapse = ", ")))
              flush.console()
              removed_samples <- union(removed_samples, outliers)
            }
          }
        }
      }
    }, error = function(e) {
      warning("PCA-Ausreißererkennung fehlgeschlagen: ", conditionMessage(e))
    })
  }

  # Samples entfernen
  keep_samples <- setdiff(colnames(raw_data), removed_samples)

  if (length(keep_samples) == 0) {
    emit_error_and_quit("Keine Samples nach Sample Quality Filter übrig!")
  }

  list(
    rgset           = raw_data[, keep_samples],
    removed_samples = removed_samples
  )
}

# ── Haupt-Filterfunktion ─────────────────────────────────────────────────────

run_filtering <- function(rgset, job_dir, cfg) {

  # 1. Detection P-Werte EINMALIG für das gesamte RGChannelSet berechnen
  cat("Berechne Detection P-Werte...\n"); flush.console()
  det_p <- tryCatch(detectionP(rgset), error = function(e) NULL)

  sq_stats_pending <- NULL

  # ── Sample Quality Filter (Arbeitet auf Sample-Ebene / Spalten) ─────────────
  if (isTRUE(cfg$sample_quality$enabled)) {
    cat("[FILTER] Sample Quality AKTIV\n"); flush.console()
    emit_progress(25, "Sample Quality Filter")

    samples_before  <- ncol(rgset)
    # filter_sample_quality arbeitet auf dem rgset
    sq_result       <- filter_sample_quality(rgset, cfg$sample_quality) 
    rgset           <- sq_result$rgset
    
    # det_p Matrix auf verbleibende Samples einschränken
    if (!is.null(det_p)) {
      det_p <- det_p[, colnames(rgset), drop = FALSE]
    }
    
    samples_after   <- ncol(rgset)
    samples_removed <- length(sq_result$removed_samples)

    sq_stats_pending <- list(
      enabled                      = TRUE,
      detection_p_cutoff           = cfg$sample_quality$detection_p_cutoff,
      sample_failure_rate          = cfg$sample_quality$sample_failure_rate,
      remove_failed_samples        = cfg$sample_quality$remove_failed_samples,
      enable_pca_outlier_detection = cfg$sample_quality$enable_pca_outlier_detection,
      samples_before               = samples_before,
      samples_after                = samples_after,
      samples_removed              = samples_removed
    )
    emit_progress(28, "Sample Quality Filter",
      before = samples_before, after = samples_after, removed = samples_removed)
  } else {
    cat("[FILTER] Sample Quality DEAKTIVIERT\n"); flush.console()
    sq_stats_pending <- list(
      enabled         = FALSE,
      samples_removed = 0,
      samples_after   = ncol(rgset)
    )
  }

  # ── KONVERTIERUNG ZU PROBE-EBENE (MethylSet) ───────────────────────────────
  # Hier passiert die Magie: rownames wechseln von Adressen zu cg-IDs!
  cat("Konvertiere RGChannelSet zu MethylSet...\n"); flush.console()
  raw_data <- preprocessRaw(rgset) 

  total_start  <- nrow(raw_data) # Das ist jetzt die echte Anzahl biologischer Probes!
  filter_stats <- list(total_start = total_start)
  remove_set   <- character(0)

  cat("Starte Filterung mit", total_start, "Probes\n"); flush.console()

  # ── Detection P-Value ──────────────────────────────────────────────────────
  if (isTRUE(cfg$det_p$enabled)) {
    cat("[FILTER] Detection P-Value AKTIV (cutoff =", cfg$det_p$cutoff, ")\n"); flush.console()
    emit_progress(30, "Detection P-Value")
    before     <- length(remove_set)
    remove_set <- filter_detp(det_p, remove_set, cutoff = cfg$det_p$cutoff)
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
    cat("[FILTER] Bead Count AKTIV (bead_cutoff =", cfg$bead_count$bead_cutoff, ")\n")
    flush.console()
    emit_progress(40, "Bead Count")
    before     <- length(remove_set)
    remove_set <- filter_beadcount(det_p, remove_set,
                                   bead_cutoff = cfg$bead_count$bead_cutoff)
    removed    <- length(remove_set) - before
    filter_stats$bead_count <- list(
      enabled = TRUE, bead_cutoff = cfg$bead_count$bead_cutoff,
      removed = removed, after = total_start - length(remove_set)
    )
    emit_progress(50, "Bead Count",
      before = total_start, after = total_start - length(remove_set), removed = removed)
  } else {
    cat("[FILTER] Bead Count DEAKTIVIERT\n"); flush.console()
    filter_stats$bead_count <- list(enabled = FALSE, removed = 0,
                                    after = total_start - length(remove_set))
  }

  # Annotation laden (jetzt direkt auf dem MethylSet möglich)
  emit_progress(60, "Annotation laden")
  ann <- tryCatch(getAnnotation(raw_data), error = function(e) NULL)

  # Ab hier funktioniert das Zusammenspiel reibungslos, da alles auf cg... IDs basiert
  probe_keep <- setdiff(rownames(raw_data), remove_set)
  cat(sprintf("[DEBUG] remove_set: %d | probe_keep: %d\n", length(remove_set), length(probe_keep))); flush.console()
  assert_probes_remain(length(probe_keep), "Pre-QC")
  if (!is.null(ann)) ann <- ann[rownames(ann) %in% probe_keep, , drop = FALSE]

  # ── Non-CpG ────────────────────────────────────────────────────────────────
  if (isTRUE(cfg$non_cpg$enabled)) {
    cat("[FILTER] Non-CpG AKTIV\n"); flush.console()
    before_n   <- length(probe_keep)
    non_cpg    <- if (!is.null(ann)) rownames(ann)[grepl("^ch\\.", rownames(ann))] else character(0)
    probe_keep <- setdiff(probe_keep, non_cpg)
    assert_probes_remain(length(probe_keep), "Non-CpG")
    if (!is.null(ann)) ann <- ann[rownames(ann) %in% probe_keep, , drop = FALSE]
    removed <- before_n - length(probe_keep)
    filter_stats$non_cpg <- list(enabled = TRUE, removed = removed, after = length(probe_keep))
    emit_progress(70, "Non-CpG",
      before = total_start, after = length(probe_keep), removed = removed)
  } else {
    cat("[FILTER] Non-CpG DEAKTIVIERT\n"); flush.console()
    filter_stats$non_cpg <- list(enabled = FALSE, removed = 0, after = length(probe_keep))
  }

  # ── SNP ────────────────────────────────────────────────────────────────────
  if (isTRUE(cfg$snp$enabled)) {
    cat("[FILTER] SNP AKTIV (maf_cutoff =", cfg$snp$maf_cutoff, ")\n"); flush.console()
    before_n <- length(probe_keep)
    if (!is.null(ann)) {
      maf      <- cfg$snp$maf_cutoff
      snp_fail <- rownames(ann)[
        (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= maf) |
        (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= maf) |
        (!is.na(ann$Probe_maf) & ann$Probe_maf >= maf)
      ]
      probe_keep <- setdiff(probe_keep, snp_fail)
      ann        <- ann[rownames(ann) %in% probe_keep, , drop = FALSE]
    }
    assert_probes_remain(length(probe_keep), "SNP")
    removed <- before_n - length(probe_keep)
    filter_stats$snp <- list(enabled = TRUE, maf_cutoff = cfg$snp$maf_cutoff,
                             removed = removed, after = length(probe_keep))
    emit_progress(80, "SNP",
      before = total_start, after = length(probe_keep), removed = removed)
  } else {
    cat("[FILTER] SNP DEAKTIVIERT\n"); flush.console()
    filter_stats$snp <- list(enabled = FALSE, removed = 0, after = length(probe_keep))
  }

  # ── Multi-Hit ──────────────────────────────────────────────────────────────
  if (isTRUE(cfg$multi_hit$enabled)) {
    cat("[FILTER] Multi-Hit AKTIV\n"); flush.console()
    before_n <- length(probe_keep)
    mh_file  <- file.path(job_dir, "multi_hit_probes.txt")
    if (file.exists(mh_file)) {
      mh         <- trimws(readLines(mh_file))
      mh         <- mh[nchar(mh) > 0]
      probe_keep <- setdiff(probe_keep, mh)
    } else {
      message("Multi-Hit-Datei nicht gefunden – Schritt übersprungen.")
    }
    assert_probes_remain(length(probe_keep), "Multi-Hit")
    removed <- before_n - length(probe_keep)
    filter_stats$multi_hit <- list(enabled = TRUE, removed = removed, after = length(probe_keep))
    emit_progress(85, "Multi-Hit",
      before = total_start, after = length(probe_keep), removed = removed)
  } else {
    cat("[FILTER] Multi-Hit DEAKTIVIERT\n"); flush.console()
    filter_stats$multi_hit <- list(enabled = FALSE, removed = 0, after = length(probe_keep))
  }

  # ── XY-Chromosomen ─────────────────────────────────────────────────────────
  if (isTRUE(cfg$xy_chromosomes$enabled)) {
    cat("[FILTER] XY-Chromosomen AKTIV\n"); flush.console()
    before_n <- length(probe_keep)
    if (!is.null(ann)) {
      xy_probes  <- rownames(ann)[ann$chr %in% c("chrX", "chrY")]
      probe_keep <- setdiff(probe_keep, xy_probes)
    }
    assert_probes_remain(length(probe_keep), "XY-Chromosomen")
    removed <- before_n - length(probe_keep)
    filter_stats$xy_chromosomes <- list(enabled = TRUE, removed = removed,
                                        after = length(probe_keep))
    emit_progress(90, "XY-Chromosomen",
      before = total_start, after = length(probe_keep), removed = removed)
  } else {
    cat("[FILTER] XY-Chromosomen DEAKTIVIERT\n"); flush.console()
    filter_stats$xy_chromosomes <- list(enabled = FALSE, removed = 0,
                                        after = length(probe_keep))
  }

  # Finales Subsetting des RGChannelSet mit allen verbleibenden Probes
  raw_filtered <- raw_data[probe_keep, ]

  # [ADDED] WURDE HINZUGEFÜGT, UM MÖGLICHEN BUG ZU FIXEN
  # rgset_filtered <- rgset[probe_keep, ]

  # sample_quality vor total_end/total_removed
  filter_stats$sample_quality <- sq_stats_pending

  filter_stats$total_end     <- length(probe_keep)
  filter_stats$total_removed <- total_start - length(probe_keep)

  # [ADDED/CONFIGURED] WURDE UM filtered_rgset erweitert, UM MÖGLICHEN BUG ZU FIXEN
  list(filtered_data = raw_filtered, filtered_rgset = rgset, filter_stats = filter_stats)
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
# [ADDED] WURDE HINZUGEFÜGT, UM MÖGLICHEN BUG ZU FIXEN
filtered_rgset <- result$filtered_rgset

filter_stats  <- result$filter_stats

# 6. Speichern
emit_progress(95, "Speichern")

# [ADDED] WURDE HINZUGEFÜGT, UM MÖGLICHEN BUG ZU FIXEN – Jetzt wird filtered_rgset gespeichert, damit die Probe-IDs erhalten bleiben
saveRDS(filtered_rgset, file.path(job_dir, "filtered_data.rds"))

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