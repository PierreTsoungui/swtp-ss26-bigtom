#!/usr/bin/env Rscript
# r_backend/dmp.R
#
#' Differentially Methylated Probe (DMP) analysis.
#'
#' Tests every CpG for differential methylation between two groups using
#' ChAMP's \code{champ.DMP}. The effect size (Delta Beta) is computed
#' deterministically from the beta matrix as mean(case) - mean(control), so the
#' sign is well-defined regardless of ChAMP's internal contrast direction.
#'
#' @section Array support:
#' 450K, EPIC v1 and EPIC v2 are supported. The array type is supplied by the
#' caller and passed to ChAMP, which loads the matching annotation internally.
#' Aliases \code{EPIC}/\code{850K} are normalized to \code{EPICv1}.
#'
#' @section Significance policy:
#' ChAMP runs with \code{adjPVal = 1} so ALL probes are returned; significance is
#' applied later as a table filter (TAB-01, consistent with dmr.R). The
#' \code{adjPVal} CLI argument is kept only for backward compatibility/logging.
#'
#' @section Usage:
#' \code{Rscript dmp.R <sample_sheet.csv> <job_dir> <beta.rds> [adjPVal] \
#'   [arraytype] [group_column] [case_group] [control_group]}
#'
#' @section Output:
#' \code{<job_dir>/dmp_results.csv} and \code{dmp_results.rds} with columns
#' \code{ID, CHR, POS, GENE, FEATURE, CGI, ADJ_P, GROUP1_AVG, GROUP2_AVG,
#' DELTA_BETA, LOG_FC, DMR_ID}.
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON.


# ── Environment setup ─────────────────────────────────────────────────────────
# Single-threaded, serial, reproducible execution (see utils/runtime.R);
# champ.DMP uses limma/BLAS.
source("/app/r_backend/utils/runtime.R")
configure_runtime()

suppressPackageStartupMessages({
  library(ChAMP)
  library(readr)
  library(jsonlite)
})

# Shared progress contract, sample-sheet and array-type helpers.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/samplesheet.R")
source("/app/r_backend/utils/arraytype.R")
source("/app/r_backend/utils/columns.R")
source("/app/r_backend/utils/beta.R")


# ── Helpers ───────────────────────────────────────────────────────────────────
# normalize_arraytype() / read_array_type() are provided by utils/arraytype.R.
# pick_col() (candidate-based, array-tolerant column access) by utils/columns.R.
# load_beta_matrix() / clamp_beta() / drop_invariant_probes() by utils/beta.R.

# load_aligned_samples()/align_samples_to_matrix() and resolve_case_control()
# are provided by utils/samplesheet.R.

#' Assemble the standardized DMP result table.
#'
#' Group means and Delta Beta are computed directly from the beta matrix
#' (case - control) so the effect-size sign is deterministic.
#'
#' @param dmp_table ChAMP DMP result table (probes x stats), rownames = CpG ids.
#' @param beta Beta matrix reduced to the two groups.
#' @param pheno Phenotype factor (levels = control, case).
#' @param case_group,control_group Group labels.
#' @return A data.frame with the canonical DMP output columns.
build_dmp_output <- function(dmp_table, beta, pheno, case_group, control_group) {
  p_col <- pick_col(dmp_table, c("adj.P.Val", "adj.p.val", "P.Value", "p.value"), fallback = NULL)
  if (is.null(p_col)) {
    emit_error("DMP result table has no recognizable p-value column.")
  }

  ids <- rownames(dmp_table)
  case_mean <- rowMeans(beta[, pheno == case_group, drop = FALSE], na.rm = TRUE)
  ctrl_mean <- rowMeans(beta[, pheno == control_group, drop = FALSE], na.rm = TRUE)
  g1 <- unname(case_mean[ids]) # Case
  g2 <- unname(ctrl_mean[ids]) # Control

  eps <- 1e-8
  data.frame(
    ID = ids,
    CHR = as.character(pick_col(dmp_table, c("CHR", "chr"))),
    POS = pick_col(dmp_table, c("MAPINFO", "pos", "POS")),
    GENE = as.character(pick_col(dmp_table, c("gene", "Gene"), fallback = "")),
    FEATURE = as.character(pick_col(dmp_table, c("feature", "Feature"), fallback = "")),
    CGI = as.character(pick_col(dmp_table, c("cgi", "CGI"), fallback = "")),
    ADJ_P = p_col,
    GROUP1_AVG = g1,
    GROUP2_AVG = g2,
    DELTA_BETA = g1 - g2,
    LOG_FC = log2((g1 + eps) / (g2 + eps)),
    DMR_ID = "-",
    stringsAsFactors = FALSE
  )
}

#' Annotate each DMP with the DMR region it falls into (if any).
#'
#' Overlap-joins the DMP positions (single base points) against the DMR intervals
#' with an interval index (\code{GenomicRanges::findOverlaps}), i.e.
#' O((#CpGs + #regions) * log) instead of the naive O(#CpGs x #regions). This is
#' essential: because ALL probes AND all regions are retained (adjPvalDmr = 1,
#' TAB-01), the naive nested scan is ~#regions x ~1M probes and can run for many
#' minutes on EPIC v2 — long enough to hit the executor's DMP timeout. When a CpG
#' falls into several regions, the first hit wins (regions rarely overlap).
#'
#' @param dmp_df The DMP output data.frame (has CHR, POS, DMR_ID).
#' @param job_dir Job directory (may contain \code{dmr_results.rds}).
#' @return \code{dmp_df} with \code{DMR_ID} filled where regions overlap.
link_dmrs <- function(dmp_df, job_dir) {
  dmr_rds_path <- file.path(job_dir, "dmr_results.rds")
  if (!file.exists(dmr_rds_path)) {
    return(dmp_df)
  }

  dmr_data <- tryCatch(
    readRDS(dmr_rds_path),
    error = function(e) emit_error(sprintf("Failed to load DMR results '%s': %s", dmr_rds_path, conditionMessage(e)))
  )
  if (is.null(dmr_data) || nrow(dmr_data) == 0L) {
    return(dmp_df)
  }

  # Keep only probes / regions with usable coordinates; GRanges rejects NA/Inf.
  chr <- as.character(dmp_df$CHR)
  pos <- suppressWarnings(as.numeric(dmp_df$POS))
  dmp_ok <- !is.na(chr) & nzchar(chr) & is.finite(pos)
  if (!any(dmp_ok)) {
    return(dmp_df)
  }

  d_chr <- as.character(dmr_data$CHR)
  d_start <- suppressWarnings(as.numeric(dmr_data$START))
  d_stop <- suppressWarnings(as.numeric(dmr_data$STOP))
  dmr_ok <- !is.na(d_chr) & nzchar(d_chr) & is.finite(d_start) & is.finite(d_stop)
  if (!any(dmr_ok)) {
    return(dmp_df)
  }

  dmp_gr <- GenomicRanges::GRanges(
    seqnames = chr[dmp_ok],
    ranges   = IRanges::IRanges(start = pos[dmp_ok], width = 1L)
  )
  dmr_gr <- GenomicRanges::GRanges(
    seqnames = d_chr[dmr_ok],
    ranges   = IRanges::IRanges(start = d_start[dmr_ok], end = d_stop[dmr_ok])
  )
  dmr_ids <- as.character(dmr_data$ID[dmr_ok])

  hits <- GenomicRanges::findOverlaps(dmp_gr, dmr_gr, select = "first")
  matched <- !is.na(hits)
  if (any(matched)) {
    dmp_df$DMR_ID[which(dmp_ok)[matched]] <- dmr_ids[hits[matched]]
  }
  dmp_df
}


# ── Argument parsing & main flow ──────────────────────────────────────────────

#' Run the DMP analysis pipeline for one job.
#'
#' Parses the CLI arguments, loads/cleans/aligns the data, resolves the two
#' comparison groups, runs champ.DMP (keeping ALL probes, TAB-01), computes the
#' deterministic effect size, links DMR overlaps, and writes the results table
#' (CSV + RDS). Fatal problems abort via \code{emit_error()}.
#'
#' Kept as a function so the file can be \code{source()}d for unit testing without
#' executing the pipeline (see the run guard below).
#'
#' @param args Character vector of CLI arguments (defaults to the process args).
#' @return Invisibly \code{TRUE} on success.
main <- function(args = commandArgs(trailingOnly = TRUE)) {
  if (length(args) < 3L) {
    emit_error("Insufficient arguments. Expected: <sample_sheet_path> <job_dir> <beta_filename>")
  }

  sample_sheet_path <- args[1]
  job_dir <- args[2]
  beta_filename <- args[3]
  beta_path <- if (file.exists(beta_filename)) beta_filename else file.path(job_dir, beta_filename)

  # Kept for compatibility/logging only; significance is a downstream table filter.
  adjPVal <- if (length(args) >= 4) as.numeric(args[4]) else 1.0
  # Array type: prefer the value minfi detected during filtering (array_type.txt);
  # the CLI argument is only a fallback. This prevents loading the wrong ChAMP
  # annotation (e.g. EPICv2 on 450K data -> "object 'probe.features' not found").
  arraytype <- read_array_type(job_dir, fallback = if (length(args) >= 5) args[5] else "EPICv2")

  # Dynamic comparison: any grouping column, explicit case/control. Delta Beta is
  # then deterministic: mean(case) - mean(control) (TAB-02).
  group_column <- if (length(args) >= 6 && nzchar(args[6])) args[6] else "Sample_Group"
  case_group <- if (length(args) >= 7 && nzchar(args[7])) args[7] else ""
  control_group <- if (length(args) >= 8 && nzchar(args[8])) args[8] else ""

  if (!dir.exists(job_dir)) dir.create(job_dir, recursive = TRUE)

  emit_progress(0, "Initializing Differential Methylation Probe (DMP) workflow")

  emit_progress(15, "Loading and validating methylation beta matrix")
  # Compose the cleaning steps: load -> clamp to [0,1] -> drop non-finite/invariant
  # probes (no methylation variance carries no DM signal and destabilises limma).
  beta <- load_beta_matrix(beta_path)
  beta <- clamp_beta(beta)
  beta <- drop_invariant_probes(beta, min_sd = 1e-5)
  if (nrow(beta) == 0L) {
    emit_error("No valid probes remain after removing non-finite and invariant rows.")
  }

  emit_progress(35, "Loading and aligning sample sheet metadata")
  if (!file.exists(sample_sheet_path)) {
    emit_error(sprintf("Sample sheet file not found at path: %s", sample_sheet_path))
  }
  samples <- tryCatch(
    read_sample_sheet_smart(sample_sheet_path),
    error = function(e) emit_error(sprintf("Failed to parse sample sheet: %s", conditionMessage(e)))
  )
  if (!group_column %in% colnames(samples)) {
    emit_error(sprintf("Group column '%s' not found in sample sheet.", group_column))
  }
  if (any(is.na(samples[[group_column]]))) {
    emit_error(sprintf("Group column '%s' contains missing values.", group_column))
  }
  # Strict alignment: every beta column must map 1:1 to a sample-sheet row.
  samples_aligned <- align_samples_to_matrix(beta, samples, mode = "strict")$samples

  emit_progress(55, "Selecting case/control groups")
  group_vec <- as.character(samples_aligned[[group_column]])
  groups <- resolve_case_control(group_vec, group_column, case_group, control_group)
  case_group <- groups$case
  control_group <- groups$control

  # Reduce to the two chosen groups; control is the reference level so
  # Delta Beta = mean(Case) - mean(Control).
  keep <- group_vec %in% c(case_group, control_group)
  beta <- beta[, keep, drop = FALSE]
  pheno <- factor(group_vec[keep], levels = c(control_group, case_group))

  # A differential test needs >= 2 samples per group; fabricating a replicate
  # would yield statistically invalid p-values, so fail clearly instead.
  group_sizes <- table(pheno)
  if (any(group_sizes < 2L)) {
    emit_error(paste0(
      "DMP analysis requires at least two samples per group. Found: ",
      paste(names(group_sizes), as.integer(group_sizes), sep = "=", collapse = ", ")
    ))
  }

  # limma (inside champ.DMP) estimates the moderated variance from the WITHIN-group
  # residuals. If a group's replicates are identical (e.g. duplicated arrays), that
  # residual variance is exactly zero for every probe and limma aborts with the
  # opaque "No sample variance". Detect this degenerate design up front and report
  # which samples are identical, so the cause is actionable.
  within_ss <- numeric(nrow(beta))
  for (g in levels(pheno)) {
    cols <- which(pheno == g)
    if (length(cols) >= 2L) {
      sub <- beta[, cols, drop = FALSE]
      within_ss <- within_ss + rowSums((sub - rowMeans(sub))^2)
    }
  }
  if (mean(within_ss < 1e-12) > 0.99) {
    cn <- colnames(beta)
    dup_pairs <- character(0)
    for (g in levels(pheno)) {
      cols <- which(pheno == g)
      for (i in seq_along(cols)) {
        for (j in seq_len(i - 1L)) {
          if (isTRUE(all.equal(beta[, cols[i]], beta[, cols[j]], tolerance = 1e-9))) {
            dup_pairs <- c(dup_pairs, sprintf("%s = %s", cn[cols[j]], cn[cols[i]]))
          }
        }
      }
    }
    emit_error(paste0(
      "Differential analysis is not possible: the replicates within a group have zero ",
      "variance, so the statistical model (limma) cannot estimate a residual variance. ",
      "This happens when samples are identical duplicates rather than genuine replicates.",
      if (length(dup_pairs)) paste0(" Identical samples: ", paste(dup_pairs, collapse = "; "), ".") else "",
      " Please use biologically distinct replicates."
    ))
  }

  emit_progress(75, "Executing statistical differential methylation test (champ.DMP)")
  # Bind the correct probe annotation globally as `probe.features` so ChAMP's
  # internals always find it (guards against "object 'probe.features' not found").
  ensure_probe_features(arraytype)
  # adjPVal = 1 keeps ALL probes; significance is applied downstream (TAB-01).
  dmp_raw <- tryCatch(
    champ.DMP(beta = beta, pheno = pheno, adjPVal = 1, arraytype = champ_arraytype(arraytype)),
    error = function(e) emit_error(sprintf("ChAMP DMP execution failed: %s", conditionMessage(e)))
  )
  if (is.null(dmp_raw) || length(dmp_raw) == 0L) {
    emit_error("Analysis anomaly: champ.DMP returned an empty result object.")
  }

  emit_progress(85, "Extracting statistical contrasts and computing metrics")
  dmp_table <- dmp_raw[[1]]
  if (is.null(dmp_table) || nrow(dmp_table) == 0L) {
    emit_error("DMP extraction failed: result table is empty. Verify that the arraytype matches the data.")
  }

  dmp_out <- build_dmp_output(dmp_table, beta, pheno, case_group, control_group)

  # Keep ALL probes; only drop rows with no computable group means. An
  # empty table is a valid outcome (handled downstream / by the table filter).
  dmp_out <- dmp_out[!is.na(dmp_out$GROUP1_AVG) & !is.na(dmp_out$GROUP2_AVG), , drop = FALSE]

  emit_progress(95, "Overlapping DMPs with DMR region coordinates")
  dmp_out <- link_dmrs(dmp_out, job_dir)

  emit_progress(100, "Saving computed DMP results")
  output_csv <- file.path(job_dir, "dmp_results.csv")
  output_rds <- file.path(job_dir, "dmp_results.rds")
  tryCatch(
    {
      write.csv(dmp_out, output_csv, row.names = FALSE)
      saveRDS(dmp_out, output_rds)
    },
    error = function(e) emit_error(sprintf("Failed to save DMP results: %s", conditionMessage(e)))
  )

  emit_done(
    output_csv = output_csv,
    output_rds = output_rds,
    total_dmps = nrow(dmp_out)
  )
  invisible(TRUE)
}

# Run only when executed as a script (Rscript). When source()d/sys.source()d for
# unit testing, sys.nframe() > 0, so the pipeline does not auto-run and the
# functions above can be tested in isolation.
if (sys.nframe() == 0L) {
  main()
  quit(save = "no", status = 0)
}
