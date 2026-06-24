#!/usr/bin/env Rscript
# r_backend/init_filter.R
#
#' Initial Filtering Pipeline for Methylation Data
#'
#' This script performs quality control and filtering on Illumina methylation
#' array data (450k, EPIC, EPICv2). It reads IDAT files and a sample sheet,
#' applies configurable filters, and saves filtered data and statistics.
#'
#' @usage Rscript init_filter.R <sample_sheet_path> <job_dir>
#'
#' @param sample_sheet_path Path to the sample sheet (CSV or Excel)
#' @param job_dir Directory containing IDAT files and filter_settings.json
#'
#' @return Writes filtered_data.rds and filter_stats.json to job_dir
#'
#' @section Filter Settings:
#' The script reads filter parameters from `<job_dir>/filter_settings.json`.
#' If the file is missing, default settings are used.
#'
#' @section Progress Output:
#' Progress is emitted via the progress.R module using JSON-formatted messages:
#' - `{"type":"progress","percent":<int>,"step":"<string>"}`
#' - `{"type":"error","message":"<string>"}`
#' - `{"type":"done"}`


# Environment Setup
Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")

suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
})

# Source progress module
source("/app/r_backend/utils/progress.R")

# Global Functions (must be defined for run_filtering)


#' Assert that probes remain after filtering step
#'
#' @param n Number of remaining probes
#' @param step_name Name of the filtering step
#' @return Invisible TRUE if condition met, otherwise emits error
assert_probes_remain <- function(n, step_name) {
  if (n == 0L) {
    emit_error(paste0("No probes remaining after step '", step_name, "'"))
  }
  invisible(TRUE)
}

# Configuration Parsing

#' Parse filter configuration from JSON
#'
#' @param json_str JSON string containing filter settings
#' @return List with normalized filter configuration
parse_filter_config <- function(json_str) {
  # Default configuration
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
    return(cfg)
  }

  raw <- tryCatch(
    fromJSON(json_str, simplifyVector = TRUE),
    error = function(e) {
      emit_error( "The filter_settings.json file could not be read. Please check the file format.")
    }
  )

  emit_progress(3, paste("[CONFIG] JSON keys:", paste(names(raw), collapse = ", ")))

  # --- Parse each section ---
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

  # --- Validation ---
  if (!is.na(cfg$det_p$cutoff) && (cfg$det_p$cutoff < 0.01 || cfg$det_p$cutoff > 0.05))
    emit_error("det_p.cutoff must be between 0.01 and 0.05")
  if (!is.na(cfg$bead_count$bead_cutoff) && (cfg$bead_count$bead_cutoff < 0.01 || cfg$bead_count$bead_cutoff > 0.1))
    emit_error("bead_count.bead_cutoff must be between 0.01 and 0.1")
  if (!is.na(cfg$snp$maf_cutoff) && (cfg$snp$maf_cutoff < 0.01 || cfg$snp$maf_cutoff > 0.1))
    emit_error("snp.maf_cutoff must be between 0.01 and 0.1")
  if (!is.na(cfg$sample_quality$detection_p_cutoff) &&
      (cfg$sample_quality$detection_p_cutoff < 0.01 || cfg$sample_quality$detection_p_cutoff > 0.05))
    emit_error("sample_quality.detection_p_cutoff must be between 0.01 and 0.05")
  if (!is.na(cfg$sample_quality$sample_failure_rate) &&
      (cfg$sample_quality$sample_failure_rate < 0.05 || cfg$sample_quality$sample_failure_rate > 0.2))
    emit_error("sample_quality.sample_failure_rate must be between 0.05 and 0.2")

  emit_progress(4, sprintf("[CONFIG] det_p:          enabled=%-5s cutoff=%.4f", cfg$det_p$enabled, cfg$det_p$cutoff))
  emit_progress(4, sprintf("[CONFIG] bead_count:     enabled=%-5s bead_cutoff=%.4f", cfg$bead_count$enabled, cfg$bead_count$bead_cutoff))
  emit_progress(4, sprintf("[CONFIG] non_cpg:        enabled=%s", cfg$non_cpg$enabled))
  emit_progress(4, sprintf("[CONFIG] snp:            enabled=%-5s maf_cutoff=%.4f", cfg$snp$enabled, cfg$snp$maf_cutoff))
  emit_progress(4, sprintf("[CONFIG] multi_hit:      enabled=%s", cfg$multi_hit$enabled))
  emit_progress(4, sprintf("[CONFIG] xy_chromosomes: enabled=%s", cfg$xy_chromosomes$enabled))
  emit_progress(4, sprintf("[CONFIG] sample_quality: enabled=%-5s detection_p_cutoff=%.4f sample_failure_rate=%.4f remove_failed=%s pca_outlier=%s",
              cfg$sample_quality$enabled,
              cfg$sample_quality$detection_p_cutoff,
              cfg$sample_quality$sample_failure_rate,
              cfg$sample_quality$remove_failed_samples,
              cfg$sample_quality$enable_pca_outlier_detection))

  cfg
}


# Preflight Validation

#' Validate sample sheet structure
#'
#' @param path Path to sample sheet file
#' @return Invisible TRUE if valid
validate_sample_sheet <- function(path) {
  raw <- readLines(path, warn = FALSE)
  
  # Check for empty file
  if (length(raw) == 0) {
    emit_error("Sample sheet is empty")
  }
  
  # Check for [Data] section (Illumina format)
  has_data_section <- any(grepl("^\\[Data\\]", raw))
  
  # Read with appropriate skip
  skip_n <- if (has_data_section) which(grepl("^\\[Data\\]", raw)) else 0L
  
  sheet <- tryCatch(
    read.csv(path, skip = skip_n, stringsAsFactors = FALSE),
    error = function(e) emit_error("Could not read sample sheet. Please check the file format.")
  )
  
  if (nrow(sheet) == 0) {
    emit_error("Sample sheet has no data rows")
  }
  
  colnames(sheet) <- trimws(colnames(sheet))
  
  # ─── FLEXIBLE SPALTENPRÜFUNG ───
  # Prüfe verschiedene gültige Spaltenkonfigurationen
  has_standard <- all(c("Sample_Name", "Sentrix_ID", "Sentrix_Position") %in% colnames(sheet))
  has_basename <- "Basename" %in% colnames(sheet)
  has_sample_id <- "Sample_ID" %in% colnames(sheet)
  
  if (!has_standard && !has_basename && !has_sample_id) {
    emit_error(paste(
      "Sample sheet missing required columns.",
      "Need one of:",
      "1. 'Sample_Name', 'Sentrix_ID', 'Sentrix_Position'",
      "2. 'Basename'",
      "3. 'Sample_ID'",
      "Found columns:", paste(colnames(sheet), collapse = ", ")
    ))
  }
  
  # ─── DUPLIKAT-PRÜFUNG ───
  if (has_standard) {
    sheet$SampleID <- paste0(sheet$Sentrix_ID, "_", sheet$Sentrix_Position)
    if (any(duplicated(sheet$SampleID))) {
      emit_error("Duplicate sample IDs found in sample sheet")
    }
  }
  
  return(invisible(TRUE))
}

# Sample Sheet Reading

#' Read sample sheet (supports CSV and Excel)
#'
#' @param path Path to sample sheet file
#' @return Data frame with sample sheet contents
read_samplesheet <- function(path) {
  raw <- readLines(path, warn = FALSE)
  
  # [Data]-Sektion finden (Illumina-Format)
  data_start <- grep("^\\[Data\\]", raw)
  skip_n <- if (length(data_start) > 0L) data_start[1L] else 0L
  
  sheet <- read.csv(path, skip = skip_n, stringsAsFactors = FALSE)
  colnames(sheet) <- trimws(colnames(sheet))
  
  
  sheet <- sheet[rowSums(is.na(sheet) | sheet == "") < ncol(sheet), , drop = FALSE]
  
  
  validate_sample_sheet(path)
  
  sheet
}


# Target Preparation


#' Prepare targets for read.metharray.exp
#'
#' @param sheet Sample sheet data frame
#' @param job_dir Job directory containing IDAT files
#' @return Updated sample sheet with Basename column
prepare_targets <- function(sheet, job_dir) {
  
  # ─── 1. Basename erstellen ───
  if (!"Basename" %in% colnames(sheet)) {
    if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(sheet))) {
      sheet$Basename <- file.path(
        job_dir,
        paste0(sheet$Sentrix_ID, "_", sheet$Sentrix_Position)
      )
    } else {
      emit_error("Sample sheet must contain 'Basename' OR ('Sentrix_ID' and 'Sentrix_Position')")
    }
  } else {
    if (!startsWith(sheet$Basename[1], "/")) {
      sheet$Basename <- file.path(job_dir, sheet$Basename)
    }
  }

  # ─── 2. Fall: Leere/Nicht vorhandene Basenames 
  if (any(is.na(sheet$Basename) | sheet$Basename == "")) {
    empty_idx <- which(is.na(sheet$Basename) | sheet$Basename == "")
    empty_samples <- sheet$Sample_Name[empty_idx]
    emit_error(paste0(
      "Empty Basename for sample(s): ",
      paste(empty_samples, collapse = ", ")
    ))
  }

  # ─── 3. Alle IDAT-Dateien im Verzeichnis finden 
  idat_files <- list.files(
    job_dir,
    pattern = "\\.(idat|IDAT)$",
    full.names = FALSE
  )
  
  if (length(idat_files) == 0) {
    emit_error("No IDAT files found in directory")
  }
  
  # ─── 4. Eindeutige IDs aus IDATs extrahieren 
  unique_ids <- unique(
    gsub("_(Grn|Red)\\.idat$", "", idat_files, ignore.case = TRUE)
  )
  
  # ─── 5. Fall: Weniger IDATs als Samples 
  expected_ids <- unique(sheet$SampleID)
  
  if (nrow(sheet) > length(unique_ids)) {
    missing_samples <- setdiff(expected_ids, unique_ids)
    emit_error(paste(
      "Sample sheet contains", nrow(sheet), "samples,",
      "but only", length(unique_ids), "IDAT pairs found.",
      "Missing samples:", paste(missing_samples, collapse = ", ")
    ))
  }

  # ─── 6. Fall: Ungültige Sentrix-ID 
  missing_ids <- setdiff(expected_ids, unique_ids)
  if (length(missing_ids) > 0) {
    emit_error(paste0(
      "No IDAT files found for sample(s): ",
      paste(missing_ids, collapse = ", ")
    ))
  }

  # ─── 7. IDAT-Paare prüfen (jedes Sample braucht beide Dateien) 
  grn_exists <- file.exists(paste0(sheet$Basename, "_Grn.idat"))
  red_exists <- file.exists(paste0(sheet$Basename, "_Red.idat"))
  
  missing_pairs <- which(!(grn_exists & red_exists))
  
  if (length(missing_pairs) > 0) {
    missing_samples <- sheet$Sample_Name[missing_pairs]
    emit_error(paste0(
      "Missing IDAT pair (red or green) for sample(s): ",
      paste(missing_samples, collapse = ", "),
      ". Each sample requires both _Grn.idat and _Red.idat files."
    ))
  }
  
  return(sheet)
}
# Filter Functions


#' Filter probes by detection p-value
#'
#' @param det_p Detection p-value matrix
#' @param remove_set Current set of probes to remove
#' @param cutoff P-value threshold (default: 0.01)
#' @return Updated remove set
filter_detp <- function(det_p, remove_set, cutoff = 0.01) {
  if (is.null(det_p)) return(remove_set)
  failed <- rownames(det_p)[
    apply(det_p, 1, function(x) any(x > cutoff, na.rm = TRUE))
  ]
  union(remove_set, failed)
}

#' Filter probes by bead count
#'
#' @param det_p Detection p-value matrix
#' @param remove_set Current set of probes to remove
#' @param bead_cutoff Bead count threshold (default: 0.05)
#' @return Updated remove set
filter_beadcount <- function(det_p, remove_set, bead_cutoff = 0.05) {
  if (is.null(det_p)) return(remove_set)
  tryCatch({
    failed <- rownames(det_p)[
      apply(det_p, 1, function(x) mean(x > 0.01, na.rm = TRUE) > bead_cutoff)
    ]
    union(remove_set, failed)
  }, error = function(e) {
    warning("Bead count filter could not be applied. The filter step will be skipped.")
    remove_set
  })
}

#' Remove non-CpG probes
#'
#' @param rgset RGChannelSet
#' @param ann Annotation data
#' @return Filtered RGChannelSet
filter_non_cpg <- function(rgset, ann) {
  if (is.null(ann)) return(rgset)
  non_cpg <- rownames(ann)[grepl("^ch\\.", rownames(ann))]
  rgset[!rownames(rgset) %in% non_cpg, ]
}

#' Filter SNP probes
#'
#' @param rgset RGChannelSet
#' @param ann Annotation data
#' @param maf_cutoff MAF threshold (default: 0.05)
#' @return Filtered RGChannelSet
filter_snp <- function(rgset, ann, maf_cutoff = 0.05) {
  if (is.null(ann)) return(rgset)
  failed <- rownames(ann)[
    (!is.na(ann$CpG_maf)   & ann$CpG_maf   >= maf_cutoff) |
    (!is.na(ann$SBE_maf)   & ann$SBE_maf   >= maf_cutoff) |
    (!is.na(ann$Probe_maf) & ann$Probe_maf >= maf_cutoff)
  ]
  rgset[!rownames(rgset) %in% failed, ]
}

#' Filter multi-hit probes
#'
#' @param rgset RGChannelSet
#' @param job_dir Directory containing multi_hit_probes.txt
#' @return Filtered RGChannelSet
filter_multi_hit <- function(rgset, job_dir) {
  mh_file <- file.path(job_dir, "multi_hit_probes.txt")
  if (!file.exists(mh_file)) {
    message("Multi-hit probe file not found – skipping filter")
    return(rgset)
  }
  mh <- trimws(readLines(mh_file))
  mh <- mh[nchar(mh) > 0]
  rgset[!rownames(rgset) %in% mh, ]
}

#' Remove XY chromosome probes
#'
#' @param rgset RGChannelSet
#' @param ann Annotation data
#' @return Filtered RGChannelSet
filter_xy <- function(rgset, ann) {
  if (is.null(ann)) return(rgset)
  xy_probes <- rownames(ann)[ann$chr %in% c("chrX", "chrY")]
  rgset[!rownames(rgset) %in% xy_probes, ]
}

#' Sample quality filtering
#'
#' @param rgset RGChannelSet
#' @param cfg_sq Sample quality configuration
#' @return List with filtered RGSet and removed samples
filter_sample_quality <- function(rgset, cfg_sq) {
  removed_samples <- character(0)
  det_p <- tryCatch(detectionP(rgset), error = function(e) NULL)

  if (is.null(det_p)) {
    warning("Sample quality filtering: Detection p-values could not be computed")
    return(list(rgset = rgset, removed_samples = removed_samples))
  }

  # Remove failed samples based on detection p-value
  if (isTRUE(cfg_sq$remove_failed_samples)) {
    failure_rates <- colMeans(det_p > cfg_sq$detection_p_cutoff, na.rm = TRUE)
    bad_samples   <- names(failure_rates)[failure_rates > cfg_sq$sample_failure_rate]

    if (length(bad_samples) > 0) {
      emit_progress(26, sprintf(
        "[SAMPLE QC] Removing %d sample(s) due to high failure rate: %s",
        length(bad_samples), paste(bad_samples, collapse = ", ")
      ))
      removed_samples <- union(removed_samples, bad_samples)
    }
  }

  # PCA outlier detection
  if (isTRUE(cfg_sq$enable_pca_outlier_detection)) {
    tryCatch({
      beta_mat <- getBeta(rgset)
      keep_cols <- setdiff(colnames(beta_mat), removed_samples)
      
      if (length(keep_cols) >= 3) {
        beta_sub  <- beta_mat[, keep_cols, drop = FALSE]
        beta_complete <- beta_sub[complete.cases(beta_sub), ]

        if (nrow(beta_complete) > 10) {
          pca_res <- prcomp(t(beta_complete), center = TRUE, scale. = FALSE)
          scores  <- pca_res$x[, 1:min(2, ncol(pca_res$x)), drop = FALSE]
          center  <- colMeans(scores)
          cov_mat <- cov(scores)

          if (det(cov_mat) > 1e-10) {
            distances   <- mahalanobis(scores, center, cov_mat)
            threshold   <- qchisq(0.975, df = ncol(scores))
            outliers    <- rownames(scores)[distances > threshold]

            if (length(outliers) > 0) {
              emit_progress(27, sprintf(
                "[SAMPLE QC] PCA outliers detected (%d): %s",
                length(outliers), paste(outliers, collapse = ", ")
              ))
              removed_samples <- union(removed_samples, outliers)
            }
          }
        }
      }
    }, error = function(e) {
      warning("PCA outlier detection could not be completed. Continuing without this check.")
    })
  }

  keep_samples <- setdiff(colnames(rgset), removed_samples)
  
  if (length(keep_samples) == 0) {
    emit_error("No samples remaining after sample quality filtering")
  }

  list(
    rgset           = rgset[, keep_samples],
    removed_samples = removed_samples
  )
}


# Main Filtering Pipeline

#' Run the complete filtering pipeline
#'
#' @param rgset RGChannelSet (raw data)
#' @param job_dir Job directory
#' @param cfg Filter configuration
#' @return List with filtered data, RGSet, and statistics
run_filtering <- function(rgset, job_dir, cfg) {

  emit_progress(22, "Computing detection p-values...")
  det_p <- tryCatch(detectionP(rgset), error = function(e) NULL)
  sq_stats_pending <- NULL

  # Sample Quality Filter

  if (isTRUE(cfg$sample_quality$enabled)) {
    emit_progress(24, "[FILTER] Sample Quality ACTIVE")
    emit_progress(25, "Sample Quality Filter")

    samples_before  <- ncol(rgset)
    sq_result       <- filter_sample_quality(rgset, cfg$sample_quality) 
    rgset           <- sq_result$rgset
    
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
    emit_progress(28, sprintf(
      "Sample Quality Filter (Before: %d, After: %d, Removed: %d)", 
      samples_before, samples_after, samples_removed
    ))
  } else {
    emit_progress(24, "[FILTER] Sample Quality INACTIVE")
    sq_stats_pending <- list(
      enabled         = FALSE,
      samples_removed = 0,
      samples_after   = ncol(rgset)
    )
  }

  # Convert to MethylSet for probe filtering
  emit_progress(29, "Converting RGChannelSet to MethylSet...")
  raw_data <- preprocessRaw(rgset) 

  total_start  <- nrow(raw_data)
  filter_stats <- list(total_start = total_start)
  remove_set   <- character(0)

  emit_progress(29, paste("Starting filtering with", total_start, "probes"))

  # Detection P-Value Filter
  if (isTRUE(cfg$det_p$enabled)) {
    emit_progress(30, paste("[FILTER] Detection P-Value ACTIVE (cutoff =", cfg$det_p$cutoff, ")"))
    emit_progress(30, "Detection P-Value")
    before     <- length(remove_set)
    remove_set <- filter_detp(det_p, remove_set, cutoff = cfg$det_p$cutoff)
    removed    <- length(remove_set) - before
    filter_stats$det_p <- list(
      enabled = TRUE, cutoff = cfg$det_p$cutoff,
      removed = removed, after = total_start - length(remove_set)
    )
    emit_progress(35, sprintf(
      "Detection P-Value (Total: %d, After: %d, Removed: %d)", 
      total_start, total_start - length(remove_set), removed
    ))
  } else {
    emit_progress(30, "[FILTER] Detection P-Value INACTIVE")
    filter_stats$det_p <- list(enabled = FALSE, removed = 0,
                               after = total_start - length(remove_set))
  }

  
  # Bead Count Filter
  if (isTRUE(cfg$bead_count$enabled)) {
    emit_progress(40, paste("[FILTER] Bead Count ACTIVE (bead_cutoff =", cfg$bead_count$bead_cutoff, ")"))
    emit_progress(40, "Bead Count")
    before     <- length(remove_set)
    remove_set <- filter_beadcount(det_p, remove_set,
                                   bead_cutoff = cfg$bead_count$bead_cutoff)
    removed    <- length(remove_set) - before
    filter_stats$bead_count <- list(
      enabled = TRUE, bead_cutoff = cfg$bead_count$bead_cutoff,
      removed = removed, after = total_start - length(remove_set)
    )
    emit_progress(50, sprintf(
      "Bead Count (Total: %d, After: %d, Removed: %d)", 
      total_start, total_start - length(remove_set), removed
    ))
  } else {
    emit_progress(40, "[FILTER] Bead Count INACTIVE")
    filter_stats$bead_count <- list(enabled = FALSE, removed = 0,
                                    after = total_start - length(remove_set))
  }


  # Load Annotation
  emit_progress(60, "Loading annotation")
  ann <- tryCatch(getAnnotation(raw_data), error = function(e) NULL)

  probe_keep <- setdiff(rownames(raw_data), remove_set)
  assert_probes_remain(length(probe_keep), "Pre-QC")
  if (!is.null(ann)) ann <- ann[rownames(ann) %in% probe_keep, , drop = FALSE]

  
  # Non-CpG Filter
  if (isTRUE(cfg$non_cpg$enabled)) {
    emit_progress(66, "[FILTER] Non-CpG ACTIVE")
    before_n   <- length(probe_keep)
    non_cpg    <- if (!is.null(ann)) rownames(ann)[grepl("^ch\\.", rownames(ann))] else character(0)
    probe_keep <- setdiff(probe_keep, non_cpg)
    assert_probes_remain(length(probe_keep), "Non-CpG")
    if (!is.null(ann)) ann <- ann[rownames(ann) %in% probe_keep, , drop = FALSE]
    removed <- before_n - length(probe_keep)
    filter_stats$non_cpg <- list(enabled = TRUE, removed = removed, after = length(probe_keep))
    emit_progress(70, sprintf(
      "Non-CpG (Total: %d, After: %d, Removed: %d)", 
      total_start, length(probe_keep), removed
    ))
  } else {
    emit_progress(66, "[FILTER] Non-CpG INACTIVE")
    filter_stats$non_cpg <- list(enabled = FALSE, removed = 0, after = length(probe_keep))
  }


  # SNP Filter
  if (isTRUE(cfg$snp$enabled)) {
    emit_progress(75, paste("[FILTER] SNP ACTIVE (maf_cutoff =", cfg$snp$maf_cutoff, ")"))
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
    emit_progress(80, sprintf(
      "SNP (Total: %d, After: %d, Removed: %d)", 
      total_start, length(probe_keep), removed
    ))
  } else {
    emit_progress(75, "[FILTER] SNP INACTIVE")
    filter_stats$snp <- list(enabled = FALSE, removed = 0, after = length(probe_keep))
  }

 
  # Multi-Hit Filter
  if (isTRUE(cfg$multi_hit$enabled)) {
    emit_progress(82, "[FILTER] Multi-Hit ACTIVE")
    before_n <- length(probe_keep)
    mh_file  <- file.path(job_dir, "multi_hit_probes.txt")
    if (file.exists(mh_file)) {
      mh         <- trimws(readLines(mh_file))
      mh         <- mh[nchar(mh) > 0]
      probe_keep <- setdiff(probe_keep, mh)
    } else {
      message("Multi-hit probe file not found - skipping filter")
    }
    assert_probes_remain(length(probe_keep), "Multi-Hit")
    removed <- before_n - length(probe_keep)
    filter_stats$multi_hit <- list(enabled = TRUE, removed = removed, after = length(probe_keep))
    emit_progress(85, sprintf(
      "Multi-Hit (Total: %d, After: %d, Removed: %d)", 
      total_start, length(probe_keep), removed
    ))
  } else {
    emit_progress(82, "[FILTER] Multi-Hit INACTIVE")
    filter_stats$multi_hit <- list(enabled = FALSE, removed = 0, after = length(probe_keep))
  }

  # XY Chromosomes Filter
  if (isTRUE(cfg$xy_chromosomes$enabled)) {
    emit_progress(88, "[FILTER] XY Chromosomes ACTIVE")
    before_n <- length(probe_keep)
    if (!is.null(ann)) {
      xy_probes  <- rownames(ann)[ann$chr %in% c("chrX", "chrY")]
      probe_keep <- setdiff(probe_keep, xy_probes)
    }
    assert_probes_remain(length(probe_keep), "XY Chromosomes")
    removed <- before_n - length(probe_keep)
    filter_stats$xy_chromosomes <- list(enabled = TRUE, removed = removed,
                                        after = length(probe_keep))
    emit_progress(90, sprintf(
      "XY Chromosomes (Total: %d, After: %d, Removed: %d)", 
      total_start, length(probe_keep), removed
    ))
  } else {
    emit_progress(88, "[FILTER] XY Chromosomes INACTIVE")
    filter_stats$xy_chromosomes <- list(enabled = FALSE, removed = 0,
                                        after = length(probe_keep))
  }

 
  # Build filtered data

  raw_filtered <- raw_data[probe_keep, ]
  filter_stats$sample_quality <- sq_stats_pending
  filter_stats$total_end     <- length(probe_keep)
  filter_stats$total_removed <- total_start - length(probe_keep)
  list(filtered_data = raw_filtered, filtered_rgset = rgset, filter_stats = filter_stats)
}

# Biological QC


#' Perform biological quality control checks
#'
#' @param filtered_rgset Filtered RGChannelSet
#' @param job_dir Job directory
#' @return Invisible TRUE if QC passed
run_biological_qc <- function(filtered_rgset, job_dir) {
  emit_progress(92, "Performing biological QC...")
  
  tryCatch({
    beta <- getBeta(filtered_rgset)
    
    # Check 1: Beta distribution
    beta_mean <- mean(beta, na.rm = TRUE)
    beta_sd <- sd(beta, na.rm = TRUE)
    emit_progress(93, sprintf("Beta distribution: mean=%.4f, sd=%.4f", beta_mean, beta_sd))
    
    # Check 2: Check for unusual beta values
    beta_outliers <- sum(beta < -0.1 | beta > 1.1, na.rm = TRUE)
    if (beta_outliers > 0) {
      warning(sprintf("Found %d beta values outside expected range [0,1]", beta_outliers))
    }
    
    # Check 3: Sample correlation
    if (ncol(beta) >= 2) {
      cor_matrix <- cor(beta, use = "pairwise.complete.obs")
      median_cor <- median(cor_matrix[lower.tri(cor_matrix)], na.rm = TRUE)
      emit_progress(94, sprintf("Median sample correlation: %.4f", median_cor))
      
      if (median_cor < 0.5) {
        warning("Low median sample correlation (< 0.5) – possible batch effect or data quality issues")
      }
    }
    
    # Save QC report
    qc_data <- list(
      beta_mean = beta_mean,
      beta_sd = beta_sd,
      n_samples = ncol(beta),
      n_probes = nrow(beta)
    )
    
    write(
      toJSON(qc_data, auto_unbox = TRUE, pretty = TRUE),
      file.path(job_dir, "qc_report.json")
    )
    
    emit_progress(95, "Biological QC completed successfully")
    
  }, error = function(e) {
    warning("Biological quality control could not be completed. Continuing with analysis.")
  })
  
  return(invisible(TRUE))
}


# Main Execution
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  emit_error("Usage: Rscript init_filter.R <sample_sheet_path> <job_dir>")
}

sample_sheet_path <- args[1]
job_dir           <- args[2]

emit_progress(1, "Starting methylation data processing...")


# Read Configuration
filter_path <- file.path(job_dir, "filter_settings.json")

if (file.exists(filter_path)) {
  emit_progress(2, "[CONFIG]  Loading filter settings...")
  filter_json <- paste(readLines(filter_path, warn = FALSE), collapse = "\n")
  emit_progress(3, "[CONFIG] Filter settings loaded successfully")
} else {
  emit_progress(2, "[CONFIG] No custom filter settings found. Using default values.")
  filter_json <- NULL
}

cfg <- parse_filter_config(filter_json)


# Read Sample Sheet

emit_progress(5, "Reading sample sheet")
sheet <- tryCatch(
  read_samplesheet(sample_sheet_path),
  error = function(e)  emit_error("The sample sheet could not be read. Please check the file format and content.")
)
emit_progress(6, paste("Columns:", paste(colnames(sheet), collapse = ", ")))


# Prepare Targets

emit_progress(8, "Preparing targets")
targets <- tryCatch(
  prepare_targets(sheet, job_dir),
  error = function(e) emit_error("Failed to prepare targets. Please check the sample sheet.")
)
emit_progress(9, paste("Basename example:", targets$Basename[1]))

# Load IDAT Files
emit_progress(10, "Loading IDAT files")
raw_data <- tryCatch(
  read.metharray.exp(targets = targets, force = TRUE),
  error = function(e) emit_error("Could not read IDAT files. The files may be corrupted or in an unsupported format.")
)
emit_progress(20, "IDAT files loaded")
emit_progress(21, paste("Probes:", nrow(raw_data), "| Samples:", ncol(raw_data)))


# Run Filtering
result <- tryCatch(
  run_filtering(raw_data, job_dir, cfg),
  error = function(e) emit_error("Failed to run filtering. Please check the input data and filter settings.")
)

filtered_data <- result$filtered_data
filtered_rgset <- result$filtered_rgset
filter_stats  <- result$filter_stats
run_biological_qc(filtered_rgset, job_dir)


# Save Results
emit_progress(96, "Saving results")
saveRDS(filtered_rgset, file.path(job_dir, "filtered_data.rds"))

write(
  toJSON(filter_stats, auto_unbox = TRUE, pretty = TRUE),
  file.path(job_dir, "filter_stats.json")
)

emit_progress(98, paste("Saved to:", job_dir))
emit_progress(100, "Filtering complete")

emit_done()