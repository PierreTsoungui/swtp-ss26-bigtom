#!/usr/bin/env Rscript
# r_backend/init_filter.R
#
#' Initial Filtering Pipeline for Methylation Data
#'
#' Performs quality control and filtering on Illumina methylation array data
#' (450k, EPIC, EPICv2). It reads IDAT files plus a sample sheet, applies the
#' configured sample- and probe-level filters, runs a light biological QC, and
#' persists the filtered data together with summary statistics.
#'
#' @section Pipeline order:
#' 1. Read & validate the sample sheet, build IDAT targets.
#' 2. Load the raw \code{RGChannelSet} from the IDAT files.
#' 3. Sample-level QC (detection-failure rate + optional PCA outlier removal).
#' 4. Probe-level filters (detection p-value, bead/detection-rate, non-CpG,
#'    SNP, multi-hit, sex chromosomes) — reported as statistics.
#' 5. Biological QC and persistence.
#'
#' @section Outputs (written to \code{job_dir}):
#' \itemize{
#'   \item \code{filtered_data.rds} — the sample-filtered \code{RGChannelSet}.
#'         It is intentionally an \code{RGChannelSet} (not a probe-subset object)
#'         because the downstream normalization step (\code{normalize.R})
#'         requires the raw channel data to model background and dye bias. The
#'         probe-level selection is therefore not applied to this object but is
#'         carried in \code{passed_probes.rds} and enforced on the beta matrix
#'         before the differential analysis (see \code{dmp.R} / \code{dmr.R}).
#'   \item \code{passed_probes.rds} — character vector of the CpG ids that passed
#'         every enabled probe-level filter. \code{dmp.R} / \code{dmr.R} restrict
#'         their beta matrix to these ids, so the reported filter counts match the
#'         probes that are actually analysed.
#'   \item \code{filter_stats.json} — per-step counts consumed by the frontend.
#'   \item \code{qc_report.json} — beta distribution / correlation summary.
#' }
#'
#' @section Filter settings:
#' Parameters are read from \code{<job_dir>/filter_settings.json}; missing files
#' fall back to defaults (every filter disabled).
#'
#' @section Progress protocol:
#' Progress is emitted via \code{utils/progress.R} as single-line JSON:
#' \code{{"type":"progress","percent":<int>,"step":"<string>"}},
#' \code{{"type":"error","message":"<string>"}}, \code{{"type":"done"}}.
#'
#' @usage Rscript init_filter.R <sample_sheet_path> <job_dir>
#' @param sample_sheet_path Path to the sample sheet (CSV or Illumina \[Data\] CSV).
#' @param job_dir Directory holding the IDAT files and \code{filter_settings.json}.


# ── Environment setup ─────────────────────────────────────────────────────────
# Single-threaded, serial, reproducible execution (see utils/runtime.R): the R
# worker shares a container and nested parallelism causes pthread_create failures
# and non-deterministic results.
source("/app/r_backend/utils/runtime.R")
configure_runtime()

suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
})

# Shared progress emitters, array-type and beta helpers.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/arraytype.R")
source("/app/r_backend/utils/beta.R")


# ── Small assertions ──────────────────────────────────────────────────────────

#' Ensure probes remain after a filtering step.
#'
#' @param n Number of remaining probes.
#' @param step_name Name of the filtering step (used in the error message).
#' @return Invisibly \code{TRUE}; emits a fatal error when \code{n == 0}.
assert_probes_remain <- function(n, step_name) {
  if (n == 0L) {
    emit_error(paste0("No probes remaining after step '", step_name, "'"))
  }
  invisible(TRUE)
}

#' Validate that a numeric configuration value lies within an inclusive range.
#'
#' Rejects non-finite values (e.g. the result of coercing non-numeric JSON),
#' which keeps invalid settings from silently disabling a filter downstream.
#'
#' @param value Numeric scalar to check.
#' @param lo,hi Inclusive lower/upper bounds.
#' @param name Parameter name shown in the error message.
#' @return Invisibly \code{TRUE}; emits a fatal error if invalid or out of range.
assert_in_range <- function(value, lo, hi, name) {
  if (length(value) != 1L || !is.finite(value)) {
    emit_error(sprintf("%s must be a number between %s and %s", name, lo, hi))
  }
  if (value < lo || value > hi) {
    emit_error(sprintf("%s must be between %s and %s", name, lo, hi))
  }
  invisible(TRUE)
}


# ── Configuration parsing ─────────────────────────────────────────────────────

#' Parse and validate the filter configuration.
#'
#' Merges the user-supplied JSON onto a fully specified default configuration,
#' coerces types defensively, and validates every numeric cutoff against the same
#' ranges the frontend enforces (so any value the UI accepts is accepted here).
#'
#' @param json_str Raw JSON string from \code{filter_settings.json}, or
#'   \code{NULL}/empty to use defaults.
#' @return A normalized configuration list with one entry per filter.
parse_filter_config <- function(json_str) {
  # Defaults: every filter disabled; cutoffs match the frontend defaults.
  cfg <- list(
    det_p = list(enabled = FALSE, cutoff = 0.01),
    bead_count = list(enabled = FALSE, bead_cutoff = 0.05),
    non_cpg = list(enabled = FALSE),
    snp = list(enabled = FALSE, maf_cutoff = 0.05),
    multi_hit = list(enabled = FALSE),
    xy_chromosomes = list(enabled = FALSE),
    sample_quality = list(
      enabled                      = FALSE,
      detection_p_cutoff           = 0.01,
      sample_failure_rate          = 0.10,
      remove_failed_samples        = TRUE,
      enable_pca_outlier_detection = TRUE
    )
  )

  if (is.null(json_str) || nchar(trimws(json_str)) == 0L) {
    return(cfg)
  }

  raw <- tryCatch(
    fromJSON(json_str, simplifyVector = TRUE),
    error = function(e) {
      emit_error("The filter_settings.json file could not be read. Please check the file format.")
    }
  )

  emit_progress(3, paste("[CONFIG] JSON keys:", paste(names(raw), collapse = ", ")))

  # --- Merge each section onto the defaults ---
  if (!is.null(raw$det_p)) {
    cfg$det_p$enabled <- isTRUE(as.logical(raw$det_p[["enabled"]]))
    if (!is.null(raw$det_p[["cutoff"]])) {
      cfg$det_p$cutoff <- as.numeric(raw$det_p[["cutoff"]])
    }
  }

  if (!is.null(raw$bead_count)) {
    cfg$bead_count$enabled <- isTRUE(as.logical(raw$bead_count[["enabled"]]))
    if (!is.null(raw$bead_count[["bead_cutoff"]])) {
      cfg$bead_count$bead_cutoff <- as.numeric(raw$bead_count[["bead_cutoff"]])
    }
  }

  if (!is.null(raw$non_cpg)) {
    cfg$non_cpg$enabled <- isTRUE(as.logical(raw$non_cpg[["enabled"]]))
  }

  if (!is.null(raw$snp)) {
    cfg$snp$enabled <- isTRUE(as.logical(raw$snp[["enabled"]]))
    if (!is.null(raw$snp[["maf_cutoff"]])) {
      cfg$snp$maf_cutoff <- as.numeric(raw$snp[["maf_cutoff"]])
    }
  }

  if (!is.null(raw$multi_hit)) {
    cfg$multi_hit$enabled <- isTRUE(as.logical(raw$multi_hit[["enabled"]]))
  }

  if (!is.null(raw$xy_chromosomes)) {
    cfg$xy_chromosomes$enabled <- isTRUE(as.logical(raw$xy_chromosomes[["enabled"]]))
  }

  if (!is.null(raw$sample_quality)) {
    sq <- raw$sample_quality
    cfg$sample_quality$enabled <- isTRUE(as.logical(sq[["enabled"]]))
    if (!is.null(sq[["detection_p_cutoff"]])) {
      cfg$sample_quality$detection_p_cutoff <- as.numeric(sq[["detection_p_cutoff"]])
    }
    if (!is.null(sq[["sample_failure_rate"]])) {
      cfg$sample_quality$sample_failure_rate <- as.numeric(sq[["sample_failure_rate"]])
    }
    if (!is.null(sq[["remove_failed_samples"]])) {
      cfg$sample_quality$remove_failed_samples <- isTRUE(as.logical(sq[["remove_failed_samples"]]))
    }
    if (!is.null(sq[["enable_pca_outlier_detection"]])) {
      cfg$sample_quality$enable_pca_outlier_detection <- isTRUE(as.logical(sq[["enable_pca_outlier_detection"]]))
    }
  }

  # --- Validation (ranges mirror the frontend constraints) ---
  assert_in_range(cfg$det_p$cutoff, 0.01, 0.05, "det_p.cutoff")
  assert_in_range(cfg$bead_count$bead_cutoff, 0.0, 1.0, "bead_count.bead_cutoff")
  assert_in_range(cfg$snp$maf_cutoff, 0.0, 0.5, "snp.maf_cutoff")
  assert_in_range(cfg$sample_quality$detection_p_cutoff, 0.01, 0.05, "sample_quality.detection_p_cutoff")
  assert_in_range(cfg$sample_quality$sample_failure_rate, 0.05, 0.2, "sample_quality.sample_failure_rate")

  # Echo the effective configuration to the log for traceability.
  emit_progress(4, sprintf("[CONFIG] det_p:          enabled=%-5s cutoff=%.4f", cfg$det_p$enabled, cfg$det_p$cutoff))
  emit_progress(4, sprintf("[CONFIG] bead_count:     enabled=%-5s bead_cutoff=%.4f", cfg$bead_count$enabled, cfg$bead_count$bead_cutoff))
  emit_progress(4, sprintf("[CONFIG] non_cpg:        enabled=%s", cfg$non_cpg$enabled))
  emit_progress(4, sprintf("[CONFIG] snp:            enabled=%-5s maf_cutoff=%.4f", cfg$snp$enabled, cfg$snp$maf_cutoff))
  emit_progress(4, sprintf("[CONFIG] multi_hit:      enabled=%s", cfg$multi_hit$enabled))
  emit_progress(4, sprintf("[CONFIG] xy_chromosomes: enabled=%s", cfg$xy_chromosomes$enabled))
  emit_progress(4, sprintf(
    "[CONFIG] sample_quality: enabled=%-5s detection_p_cutoff=%.4f sample_failure_rate=%.4f remove_failed=%s pca_outlier=%s",
    cfg$sample_quality$enabled,
    cfg$sample_quality$detection_p_cutoff,
    cfg$sample_quality$sample_failure_rate,
    cfg$sample_quality$remove_failed_samples,
    cfg$sample_quality$enable_pca_outlier_detection
  ))

  cfg
}


# ── Sample sheet handling ─────────────────────────────────────────────────────

#' Read a sample sheet (plain CSV or Illumina \[Data\] CSV).
#'
#' Detects an Illumina \code{[Data]} header and skips the preamble, trims column
#' names, and drops fully empty rows. Reading happens exactly once.
#'
#' @param path Path to the sample sheet file.
#' @return A \code{data.frame} with the sample sheet contents.
read_samplesheet <- function(path) {
  raw <- readLines(path, warn = FALSE)
  if (length(raw) == 0L) {
    emit_error("Sample sheet is empty")
  }

  # [Data] section (Illumina format): everything before it is preamble.
  data_start <- grep("^\\[Data\\]", raw)
  skip_n <- if (length(data_start) > 0L) data_start[1L] else 0L

  sheet <- tryCatch(
    read.csv(path, skip = skip_n, stringsAsFactors = FALSE, check.names = FALSE),
    error = function(e) emit_error("Could not read sample sheet. Please check the file format.")
  )
  colnames(sheet) <- trimws(colnames(sheet))

  # Drop rows that are entirely empty (NA or "").
  keep_rows <- rowSums(is.na(sheet) | sheet == "") < ncol(sheet)
  sheet[keep_rows, , drop = FALSE]
}

#' Validate the structure of a parsed sample sheet.
#'
#' Operates on the already-parsed data frame (no re-reading). Accepts any of the
#' three supported column layouts and rejects empty sheets or duplicate samples.
#'
#' @param sheet Parsed sample-sheet data frame.
#' @return Invisibly \code{TRUE}; emits a fatal error on any structural problem.
validate_sample_sheet <- function(sheet) {
  if (nrow(sheet) == 0L) {
    emit_error("Sample sheet has no data rows")
  }

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

  # Duplicate detection on the identifier that actually locates the IDAT files.
  # Basename takes precedence when present, matching prepare_targets(): a sheet
  # may legitimately carry both a Basename column and (placeholder) Sentrix
  # columns, and the Basename is what names the files on disk.
  ids <- if (has_basename) {
    basename(as.character(sheet$Basename))
  } else if (has_standard) {
    paste0(sheet$Sentrix_ID, "_", sheet$Sentrix_Position)
  } else {
    as.character(sheet$Sample_ID)
  }
  dup_ids <- unique(ids[duplicated(ids)])
  if (length(dup_ids) > 0L) {
    emit_error(sprintf(
      "Duplicate sample IDs found in sample sheet: %s. Each physical array (Sentrix_ID + Sentrix_Position) must appear only once.",
      paste(dup_ids, collapse = ", ")
    ))
  }

  invisible(TRUE)
}


# ── Target preparation ────────────────────────────────────────────────────────

#' Build IDAT targets for \code{read.metharray.exp}.
#'
#' Resolves a \code{Basename} per sample (from an existing column or from
#' \code{Sentrix_ID}/\code{Sentrix_Position}), verifies that every sample has a
#' complete \code{_Grn.idat} + \code{_Red.idat} pair on disk, and returns the
#' augmented sample sheet.
#'
#' @param sheet Validated sample-sheet data frame.
#' @param job_dir Directory containing the IDAT files.
#' @return The sample sheet with an absolute \code{Basename} column added.
prepare_targets <- function(sheet, job_dir) {
  # 1. Resolve Basename (absolute path prefix, no extension).
  if (!"Basename" %in% colnames(sheet)) {
    if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(sheet))) {
      sheet$Basename <- file.path(job_dir, paste0(sheet$Sentrix_ID, "_", sheet$Sentrix_Position))
    } else {
      emit_error("Sample sheet must contain 'Basename' OR ('Sentrix_ID' and 'Sentrix_Position')")
    }
  } else {
    # Make any relative Basename absolute against the job directory (per row).
    rel <- !startsWith(as.character(sheet$Basename), "/")
    sheet$Basename[rel] <- file.path(job_dir, sheet$Basename[rel])
  }

  # Human-readable labels for error messages (fall back to the IDAT id).
  sample_labels <- if ("Sample_Name" %in% colnames(sheet)) {
    as.character(sheet$Sample_Name)
  } else {
    basename(as.character(sheet$Basename))
  }

  # 2. Reject empty Basenames.
  empty_idx <- which(is.na(sheet$Basename) | sheet$Basename == "")
  if (length(empty_idx) > 0L) {
    emit_error(paste0(
      "Empty Basename for sample(s): ",
      paste(sample_labels[empty_idx], collapse = ", ")
    ))
  }

  # 3. Discover the IDAT files present in the directory.
  idat_files <- list.files(job_dir, pattern = "\\.(idat|IDAT)$", full.names = FALSE)
  if (length(idat_files) == 0L) {
    emit_error("No IDAT files found in directory")
  }
  found_ids <- unique(gsub("_(Grn|Red)\\.idat$", "", idat_files, ignore.case = TRUE))

  # 4. Every expected sample id must have IDAT files on disk.
  expected_ids <- basename(as.character(sheet$Basename))
  missing_ids <- setdiff(expected_ids, found_ids)
  if (length(missing_ids) > 0L) {
    missing_labels <- sample_labels[expected_ids %in% missing_ids]
    emit_error(paste0(
      "No IDAT files found for sample(s): ",
      paste(missing_labels, collapse = ", ")
    ))
  }

  # 5. Each sample needs BOTH channels.
  grn_exists <- file.exists(paste0(sheet$Basename, "_Grn.idat"))
  red_exists <- file.exists(paste0(sheet$Basename, "_Red.idat"))
  missing_pairs <- which(!(grn_exists & red_exists))
  if (length(missing_pairs) > 0L) {
    emit_error(paste0(
      "Missing IDAT pair (red or green) for sample(s): ",
      paste(sample_labels[missing_pairs], collapse = ", "),
      ". Each sample requires both _Grn.idat and _Red.idat files."
    ))
  }

  sheet
}


#' Verify every sample's IDAT comes from the same array platform.
#'
#' minfi's \code{read.metharray.exp} cannot combine IDAT files of different array
#' types — their bead-address counts differ — and fails with an opaque error that
#' surfaces to the user as "the files may be corrupted". Reading the cheap
#' per-file probe count (\code{idat_probe_count}) up front lets us reject a mixed
#' upload with a precise, actionable message that names the affected samples.
#'
#' @param targets Sample sheet with an absolute \code{Basename} column (as
#'   returned by \code{prepare_targets}).
#' @return Invisibly \code{TRUE}; emits a fatal error when array types are mixed.
assert_uniform_array_type <- function(targets) {
  grn_files <- paste0(targets$Basename, "_Grn.idat")
  counts <- vapply(grn_files, idat_probe_count, integer(1L), USE.NAMES = FALSE)

  labels <- if ("Sample_Name" %in% colnames(targets)) {
    as.character(targets$Sample_Name)
  } else {
    basename(as.character(targets$Basename))
  }

  known <- !is.na(counts)
  distinct <- sort(unique(counts[known]))
  if (length(distinct) > 1L) {
    groups <- vapply(distinct, function(cnt) {
      sprintf("%d probes (%s)", cnt, paste(labels[known & counts == cnt], collapse = ", "))
    }, character(1L))
    emit_error(paste0(
      "The uploaded IDAT files come from different array types and cannot be ",
      "analyzed together. Every sample must be from the same platform (450K, ",
      "EPIC, or EPICv2). Detected: ", paste(groups, collapse = " vs. "), "."
    ))
  }

  invisible(TRUE)
}


# ── Probe filters (pure: each returns the probe IDs to remove) ─────────────────

#' Probes whose detection p-value exceeds the cutoff in any sample.
#'
#' @param det_p Detection p-value matrix (probes x samples), or \code{NULL}.
#' @param cutoff Detection p-value threshold.
#' @return Character vector of probe IDs to remove.
detp_failed_probes <- function(det_p, cutoff = 0.01) {
  if (is.null(det_p)) {
    return(character(0))
  }
  rownames(det_p)[apply(det_p, 1L, function(x) any(x > cutoff, na.rm = TRUE))]
}

#' Probes that are unreliable in more than a given fraction of samples.
#'
#' @details This approximates a bead-count filter using the per-sample detection
#'   rate: a probe is dropped when it fails detection (p > 0.01) in a fraction of
#'   samples greater than \code{bead_cutoff}. A true bead-count filter would
#'   require reading the IDATs with \code{extended = TRUE} and using
#'   \code{getNBeads()}; this proxy avoids that extra memory cost while still
#'   removing probes with poor cross-sample support.
#'
#' @param det_p Detection p-value matrix (probes x samples), or \code{NULL}.
#' @param bead_cutoff Maximum tolerated fraction of failing samples (0–1).
#' @return Character vector of probe IDs to remove.
beadcount_failed_probes <- function(det_p, bead_cutoff = 0.05) {
  if (is.null(det_p)) {
    return(character(0))
  }
  tryCatch(
    rownames(det_p)[apply(det_p, 1L, function(x) mean(x > 0.01, na.rm = TRUE) > bead_cutoff)],
    error = function(e) {
      warning("Bead count filter could not be applied. The filter step will be skipped.")
      character(0)
    }
  )
}

#' Non-CpG (CpH) probes, identified by the \code{ch.} id prefix.
#'
#' @param ann Annotation data frame (rownames = probe IDs), or \code{NULL}.
#' @return Character vector of probe IDs to remove.
non_cpg_probes <- function(ann) {
  if (is.null(ann)) {
    return(character(0))
  }
  rownames(ann)[grepl("^ch\\.", rownames(ann))]
}

#' SNP-affected probes at or above a minor-allele-frequency cutoff.
#'
#' Robust to annotation variants (e.g. EPICv2): only the MAF columns that are
#' actually present are considered.
#'
#' @param ann Annotation data frame, or \code{NULL}.
#' @param maf_cutoff Minor allele frequency threshold (0–0.5).
#' @return Character vector of probe IDs to remove.
snp_probes <- function(ann, maf_cutoff = 0.05) {
  if (is.null(ann)) {
    return(character(0))
  }
  maf_cols <- intersect(c("CpG_maf", "SBE_maf", "Probe_maf"), colnames(ann))
  if (length(maf_cols) == 0L) {
    warning("SNP filter: no MAF annotation columns found - filter skipped")
    return(character(0))
  }
  fail <- Reduce(`|`, lapply(maf_cols, function(col) {
    !is.na(ann[[col]]) & ann[[col]] >= maf_cutoff
  }))
  rownames(ann)[fail]
}

#' Sex-chromosome probes (chrX / chrY).
#'
#' @param ann Annotation data frame (with a \code{chr} column), or \code{NULL}.
#' @return Character vector of probe IDs to remove.
xy_probes <- function(ann) {
  if (is.null(ann) || is.null(ann$chr)) {
    return(character(0))
  }
  rownames(ann)[!is.na(ann$chr) & ann$chr %in% c("chrX", "chrY")]
}

#' Multi-hit (cross-reactive) probes listed in \code{multi_hit_probes.txt}.
#'
#' @param job_dir Directory that may contain \code{multi_hit_probes.txt}.
#' @return Character vector of probe IDs to remove (empty if the file is absent).
multi_hit_probes <- function(job_dir) {
  mh_file <- file.path(job_dir, "multi_hit_probes.txt")
  if (!file.exists(mh_file)) {
    message("Multi-hit probe file not found - skipping filter")
    return(character(0))
  }
  mh <- trimws(readLines(mh_file, warn = FALSE))
  mh[nzchar(mh)]
}

#' Apply one probe-level filter step and record its statistics.
#'
#' Centralises the boilerplate shared by every probe filter (enable check,
#' set difference, "probes remain" assertion, stats entry, progress messages),
#' so the pipeline stays consistent and adding a filter is a single call.
#'
#' @param probe_keep Character vector of currently surviving probe IDs.
#' @param total_start Initial probe count (for the progress message).
#' @param stats The \code{filter_stats} list to append to.
#' @param key Stats key under which this step is stored (frontend contract).
#' @param label Human-readable step name.
#' @param enabled Logical; whether the filter is active.
#' @param remove_fn Zero-argument function returning probe IDs to remove.
#' @param pct_start,pct_end Progress percentages for the start/end messages.
#' @param extra Named list merged into the stats entry when enabled (e.g.
#'   \code{list(cutoff = 0.01)}); also echoed in the "ACTIVE" log line.
#' @return List with the updated \code{probe_keep} and \code{stats}.
apply_probe_filter <- function(probe_keep, total_start, stats, key, label,
                               enabled, remove_fn, pct_start, pct_end,
                               extra = list()) {
  if (isTRUE(enabled)) {
    detail <- if (length(extra) > 0L) {
      paste0(" (", paste(names(extra), unlist(extra), sep = " = ", collapse = ", "), ")")
    } else {
      ""
    }
    emit_progress(pct_start, sprintf("[FILTER] %s ACTIVE%s", label, detail))

    before <- length(probe_keep)
    probe_keep <- setdiff(probe_keep, remove_fn())
    assert_probes_remain(length(probe_keep), label)
    removed <- before - length(probe_keep)

    stats[[key]] <- c(
      list(enabled = TRUE, removed = removed, after = length(probe_keep)),
      extra
    )
    emit_progress(pct_end, sprintf(
      "%s (Total: %d, After: %d, Removed: %d)",
      label, total_start, length(probe_keep), removed
    ))
  } else {
    emit_progress(pct_start, sprintf("[FILTER] %s INACTIVE", label))
    stats[[key]] <- list(enabled = FALSE, removed = 0L, after = length(probe_keep))
  }
  list(probe_keep = probe_keep, stats = stats)
}


# ── Sample-level quality control ──────────────────────────────────────────────

#' Sample-level quality filtering.
#'
#' Removes samples with a high detection-failure rate and, optionally, PCA-based
#' outliers (Mahalanobis distance on the first principal components). Both checks
#' are defensive: any internal failure degrades gracefully rather than aborting.
#'
#' @param rgset Raw \code{RGChannelSet}.
#' @param cfg_sq Sample-quality configuration list.
#' @param det_p Precomputed detection p-value matrix (probes x samples), or
#'   \code{NULL} to compute it on demand.
#' @return List with the filtered \code{rgset} and the \code{removed_samples}.
filter_sample_quality <- function(rgset, cfg_sq, det_p = NULL) {
  removed_samples <- character(0)

  if (is.null(det_p)) {
    det_p <- tryCatch(detectionP(rgset), error = function(e) NULL)
  }
  if (is.null(det_p)) {
    warning("Sample quality filtering: detection p-values could not be computed")
    return(list(rgset = rgset, removed_samples = removed_samples))
  }

  # Remove samples whose detection-failure rate exceeds the threshold.
  if (isTRUE(cfg_sq$remove_failed_samples)) {
    failure_rates <- colMeans(det_p > cfg_sq$detection_p_cutoff, na.rm = TRUE)
    bad_samples <- names(failure_rates)[failure_rates > cfg_sq$sample_failure_rate]
    if (length(bad_samples) > 0L) {
      emit_progress(26, sprintf(
        "[SAMPLE QC] Removing %d sample(s) due to high failure rate: %s",
        length(bad_samples), paste(bad_samples, collapse = ", ")
      ))
      removed_samples <- union(removed_samples, bad_samples)
    }
  }

  # PCA-based outlier detection on beta values (extract_beta preprocesses the
  # RGChannelSet, which has no direct getBeta method).
  if (isTRUE(cfg_sq$enable_pca_outlier_detection)) {
    tryCatch(
      {
        beta_mat <- extract_beta(rgset)
        keep_cols <- setdiff(colnames(beta_mat), removed_samples)

        if (length(keep_cols) >= 3L) {
          beta_sub <- beta_mat[, keep_cols, drop = FALSE]
          beta_complete <- beta_sub[complete.cases(beta_sub), , drop = FALSE]

          if (nrow(beta_complete) > 10L) {
            pca_res <- prcomp(t(beta_complete), center = TRUE, scale. = FALSE)
            scores <- pca_res$x[, seq_len(min(2L, ncol(pca_res$x))), drop = FALSE]
            center <- colMeans(scores)
            cov_mat <- cov(scores)

            if (det(cov_mat) > 1e-10) {
              distances <- mahalanobis(scores, center, cov_mat)
              threshold <- qchisq(0.975, df = ncol(scores))
              outliers <- rownames(scores)[distances > threshold]
              if (length(outliers) > 0L) {
                emit_progress(27, sprintf(
                  "[SAMPLE QC] PCA outliers detected (%d): %s",
                  length(outliers), paste(outliers, collapse = ", ")
                ))
                removed_samples <- union(removed_samples, outliers)
              }
            }
          }
        }
      },
      error = function(e) {
        warning("PCA outlier detection could not be completed. Continuing without this check.")
      }
    )
  }

  keep_samples <- setdiff(colnames(rgset), removed_samples)
  if (length(keep_samples) == 0L) {
    emit_error("No samples remaining after sample quality filtering")
  }

  list(rgset = rgset[, keep_samples], removed_samples = removed_samples)
}


# ── Main filtering pipeline ───────────────────────────────────────────────────

#' Run the complete filtering pipeline.
#'
#' Applies sample-level QC to the \code{RGChannelSet}, then computes the
#' probe-level filter selection. The returned \code{RGChannelSet} is
#' sample-filtered only; the surviving probe ids are returned separately
#' (\code{passed_probes}) and persisted by the caller so the differential
#' analysis can restrict its beta matrix to them (see the script header).
#'
#' @param rgset Raw \code{RGChannelSet} (all samples).
#' @param job_dir Job directory (for the multi-hit probe list).
#' @param cfg Parsed filter configuration.
#' @return List with \code{filtered_rgset}, \code{filter_stats} and
#'   \code{passed_probes} (the ids of the probes that passed every enabled filter).
run_filtering <- function(rgset, job_dir, cfg) {
  emit_progress(22, "Computing detection p-values...")
  det_p <- tryCatch(detectionP(rgset), error = function(e) NULL)

  # ── Sample quality filter ──────────────────────────────────────────────────
  if (isTRUE(cfg$sample_quality$enabled)) {
    emit_progress(24, "[FILTER] Sample Quality ACTIVE")
    samples_before <- ncol(rgset)
    sq_result <- filter_sample_quality(rgset, cfg$sample_quality, det_p = det_p)
    rgset <- sq_result$rgset

    # Keep the detection matrix aligned with the surviving samples.
    if (!is.null(det_p)) det_p <- det_p[, colnames(rgset), drop = FALSE]

    sq_stats <- list(
      enabled                      = TRUE,
      detection_p_cutoff           = cfg$sample_quality$detection_p_cutoff,
      sample_failure_rate          = cfg$sample_quality$sample_failure_rate,
      remove_failed_samples        = cfg$sample_quality$remove_failed_samples,
      enable_pca_outlier_detection = cfg$sample_quality$enable_pca_outlier_detection,
      samples_before               = samples_before,
      samples_after                = ncol(rgset),
      samples_removed              = length(sq_result$removed_samples)
    )
    emit_progress(28, sprintf(
      "Sample Quality Filter (Before: %d, After: %d, Removed: %d)",
      sq_stats$samples_before, sq_stats$samples_after, sq_stats$samples_removed
    ))
  } else {
    emit_progress(24, "[FILTER] Sample Quality INACTIVE")
    sq_stats <- list(enabled = FALSE, samples_removed = 0L, samples_after = ncol(rgset))
  }

  # ── Convert to a probe-indexed MethylSet for probe-level work ───────────────
  # RGChannelSet rows are addresses; preprocessRaw yields CpG-indexed rows that
  # align with detectionP() and getAnnotation().
  emit_progress(29, "Converting RGChannelSet to MethylSet...")
  mset <- preprocessRaw(rgset)

  total_start <- nrow(mset)
  probe_keep <- rownames(mset)
  filter_stats <- list(total_start = total_start)
  emit_progress(29, paste("Starting filtering with", total_start, "probes"))

  # ── Detection-based probe filters (operate on det_p) ────────────────────────
  step <- apply_probe_filter(
    probe_keep, total_start, filter_stats, "det_p", "Detection P-Value",
    enabled = cfg$det_p$enabled,
    remove_fn = function() detp_failed_probes(det_p, cfg$det_p$cutoff),
    pct_start = 30, pct_end = 35,
    extra = list(cutoff = cfg$det_p$cutoff)
  )
  probe_keep <- step$probe_keep
  filter_stats <- step$stats

  step <- apply_probe_filter(
    probe_keep, total_start, filter_stats, "bead_count", "Bead Count",
    enabled = cfg$bead_count$enabled,
    remove_fn = function() beadcount_failed_probes(det_p, cfg$bead_count$bead_cutoff),
    pct_start = 40, pct_end = 50,
    extra = list(bead_cutoff = cfg$bead_count$bead_cutoff)
  )
  probe_keep <- step$probe_keep
  filter_stats <- step$stats

  # ── Annotation-based probe filters ──────────────────────────────────────────
  emit_progress(60, "Loading annotation")
  ann <- tryCatch(getAnnotation(mset), error = function(e) NULL)
  if (!is.null(ann)) ann <- ann[rownames(ann) %in% probe_keep, , drop = FALSE]

  step <- apply_probe_filter(
    probe_keep, total_start, filter_stats, "non_cpg", "Non-CpG",
    enabled = cfg$non_cpg$enabled,
    remove_fn = function() non_cpg_probes(ann),
    pct_start = 66, pct_end = 70
  )
  probe_keep <- step$probe_keep
  filter_stats <- step$stats

  step <- apply_probe_filter(
    probe_keep, total_start, filter_stats, "snp", "SNP",
    enabled = cfg$snp$enabled,
    remove_fn = function() snp_probes(ann, cfg$snp$maf_cutoff),
    pct_start = 75, pct_end = 80,
    extra = list(maf_cutoff = cfg$snp$maf_cutoff)
  )
  probe_keep <- step$probe_keep
  filter_stats <- step$stats

  step <- apply_probe_filter(
    probe_keep, total_start, filter_stats, "multi_hit", "Multi-Hit",
    enabled = cfg$multi_hit$enabled,
    remove_fn = function() multi_hit_probes(job_dir),
    pct_start = 82, pct_end = 85
  )
  probe_keep <- step$probe_keep
  filter_stats <- step$stats

  step <- apply_probe_filter(
    probe_keep, total_start, filter_stats, "xy_chromosomes", "XY Chromosomes",
    enabled = cfg$xy_chromosomes$enabled,
    remove_fn = function() xy_probes(ann),
    pct_start = 88, pct_end = 90
  )
  probe_keep <- step$probe_keep
  filter_stats <- step$stats

  # ── Totals ──────────────────────────────────────────────────────────────────
  filter_stats$sample_quality <- sq_stats
  filter_stats$total_end <- length(probe_keep)
  filter_stats$total_removed <- total_start - length(probe_keep)

  list(filtered_rgset = rgset, filter_stats = filter_stats, passed_probes = probe_keep)
}


# ── Biological QC ─────────────────────────────────────────────────────────────

#' Perform light biological quality control on the filtered data.
#'
#' Computes the beta-value distribution and median inter-sample correlation, logs
#' warnings for anomalies, and writes \code{qc_report.json}. Non-fatal: failures
#' are logged and the pipeline continues.
#'
#' @param filtered_rgset Sample-filtered \code{RGChannelSet}.
#' @param job_dir Job directory for the QC report.
#' @return Invisibly \code{TRUE}.
run_biological_qc <- function(filtered_rgset, job_dir) {
  emit_progress(92, "Performing biological QC...")

  tryCatch(
    {
      # extract_beta preprocesses the RGChannelSet (no direct getBeta method).
      beta <- extract_beta(filtered_rgset)

      beta_mean <- mean(beta, na.rm = TRUE)
      beta_sd <- sd(beta, na.rm = TRUE)
      emit_progress(93, sprintf("Beta distribution: mean=%.4f, sd=%.4f", beta_mean, beta_sd))

      beta_outliers <- sum(beta < -0.1 | beta > 1.1, na.rm = TRUE)
      if (beta_outliers > 0L) {
        warning(sprintf("Found %d beta values outside expected range [0,1]", beta_outliers))
      }

      if (ncol(beta) >= 2L) {
        cor_matrix <- cor(beta, use = "pairwise.complete.obs")
        median_cor <- median(cor_matrix[lower.tri(cor_matrix)], na.rm = TRUE)
        emit_progress(94, sprintf("Median sample correlation: %.4f", median_cor))
        if (!is.na(median_cor) && median_cor < 0.5) {
          warning("Low median sample correlation (< 0.5) - possible batch effect or data quality issues")
        }
      }

      qc_data <- list(
        beta_mean = beta_mean,
        beta_sd   = beta_sd,
        n_samples = ncol(beta),
        n_probes  = nrow(beta)
      )
      write(
        toJSON(qc_data, auto_unbox = TRUE, pretty = TRUE),
        file.path(job_dir, "qc_report.json")
      )
      emit_progress(95, "Biological QC completed successfully")
    },
    error = function(e) {
      warning("Biological quality control could not be completed. Continuing with analysis.")
    }
  )

  invisible(TRUE)
}


# detect_array_type() / write_array_type() are provided by utils/arraytype.R.


# ── Main execution ────────────────────────────────────────────────────────────

#' Run the end-to-end filtering pipeline for a single job.
#'
#' Wires the stages together: parse config -> read & validate the sample sheet ->
#' prepare IDAT targets -> load the raw \code{RGChannelSet} -> persist the
#' detected array type -> filter -> biological QC -> persist outputs. Every fatal
#' problem is reported through \code{emit_error()} (which aborts the process).
#'
#' Kept as a function so the file can be \code{source()}d for unit testing without
#' executing the pipeline (see the run guard below).
#'
#' @param sample_sheet_path Path to the sample sheet (CSV or Illumina \[Data\] CSV).
#' @param job_dir Directory holding the IDAT files and \code{filter_settings.json};
#'   also the destination for all outputs.
#' @return Invisibly \code{TRUE} on success.
main <- function(sample_sheet_path, job_dir) {
  emit_progress(1, "Starting methylation data processing...")

  # Read configuration (defaults when absent).
  filter_path <- file.path(job_dir, "filter_settings.json")
  if (file.exists(filter_path)) {
    emit_progress(2, "[CONFIG] Loading filter settings...")
    filter_json <- paste(readLines(filter_path, warn = FALSE), collapse = "\n")
    emit_progress(3, "[CONFIG] Filter settings loaded successfully")
  } else {
    emit_progress(2, "[CONFIG] No custom filter settings found. Using default values.")
    filter_json <- NULL
  }
  cfg <- parse_filter_config(filter_json)

  # Read & validate the sample sheet (read once, validate the data frame).
  emit_progress(5, "Reading sample sheet")
  sheet <- tryCatch(
    read_samplesheet(sample_sheet_path),
    error = function(e) emit_error("The sample sheet could not be read. Please check the file format and content.")
  )
  validate_sample_sheet(sheet)
  emit_progress(6, paste("Columns:", paste(colnames(sheet), collapse = ", ")))

  # Prepare IDAT targets.
  emit_progress(8, "Preparing targets")
  targets <- tryCatch(
    prepare_targets(sheet, job_dir),
    error = function(e) emit_error(conditionMessage(e))
  )
  emit_progress(9, paste("Basename example:", targets$Basename[1]))

  # Fail fast on a mixed-platform upload: minfi cannot combine IDATs of different
  # array types and would otherwise abort with an opaque "corrupted files" error.
  assert_uniform_array_type(targets)

  # Load IDAT files into a raw RGChannelSet.
  emit_progress(10, "Loading IDAT files")
  raw_data <- tryCatch(
    read.metharray.exp(targets = targets, force = TRUE),
    error = function(e) emit_error("Could not read IDAT files. The files may be corrupted or in an unsupported format.")
  )
  emit_progress(20, "IDAT files loaded")
  emit_progress(21, paste("Probes:", nrow(raw_data), "| Samples:", ncol(raw_data)))

  # Persist the minfi-detected array type so downstream DMP/DMR use the correct
  # ChAMP annotation (450K vs EPIC v1 vs EPIC v2) instead of a fixed default.
  detected_array_type <- detect_array_type(raw_data)
  if (write_array_type(job_dir, detected_array_type)) {
    emit_progress(21, paste("Detected array type:", detected_array_type))
  } else {
    emit_progress(21, "Array type could not be detected; downstream steps will use their default.")
  }

  # Run the filtering pipeline.
  result <- tryCatch(
    run_filtering(raw_data, job_dir, cfg),
    error = function(e) emit_error(conditionMessage(e))
  )
  filtered_rgset <- result$filtered_rgset
  filter_stats <- result$filter_stats
  passed_probes <- result$passed_probes

  # Biological QC (non-fatal).
  run_biological_qc(filtered_rgset, job_dir)

  # Persist results.
  emit_progress(96, "Saving results")
  saveRDS(filtered_rgset, file.path(job_dir, "filtered_data.rds"))
  # Persist the probe-level selection separately: filtered_data.rds must keep all
  # probes for normalization, so dmp.R / dmr.R restrict their beta matrix to these
  # ids (see utils/beta.R::restrict_to_passed_probes) so the reported filter counts
  # match the probes actually analysed.
  saveRDS(passed_probes, file.path(job_dir, "passed_probes.rds"))
  write(
    toJSON(filter_stats, auto_unbox = TRUE, pretty = TRUE),
    file.path(job_dir, "filter_stats.json")
  )
  emit_progress(98, paste("Saved to:", job_dir))
  emit_progress(100, "Filtering complete")

  emit_done()
  invisible(TRUE)
}

# Execute only when run as a script (Rscript init_filter.R ...). When the file is
# source()d/sys.source()d for unit testing, frames remain on the call stack so
# sys.nframe() > 0 and the pipeline does NOT auto-run — tests can load and call
# the individual functions in isolation.
if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 2L) {
    emit_error("Usage: Rscript init_filter.R <sample_sheet_path> <job_dir>")
  }
  main(args[1], args[2])
}
