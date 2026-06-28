#!/usr/bin/env Rscript
# r_backend/batch_svd.R
#
#' SVD association diagnostic for batch-effect detection.
#'
#' Computes principal components of the methylation beta matrix and tests every
#' sample-sheet grouping variable for association with each component
#' (Kruskal-Wallis). The result is rendered as a static heatmap
#' (variables x principal components) — a PNG for inline display and a vector PDF
#' for download. A strong association between a *technical* variable and a major
#' component signals a batch effect.
#'
#' The script is array-agnostic: it operates purely on a numeric beta matrix, so
#' 450K, EPIC v1 and EPIC v2 data are all supported without special handling.
#' It also works with ARBITRARY sample-sheet column names — every column that
#' actually groups the samples becomes a row; there is no hardcoded
#' biological/technical column and no whitelist.
#'
#' @section Usage:
#' \code{Rscript batch_svd.R <beta_path> <sample_sheet_path> <job_dir> [<png_name>]}
#'
#' @section Output:
#' \code{<job_dir>/<png_name>} and the matching \code{.pdf}.
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON.


# ── Environment setup ─────────────────────────────────────────────────────────
# Pin numerical backends to a single thread for deterministic, container-safe
# execution (consistent with the other pipeline scripts).
Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")
Sys.setenv(NUMEXPR_NUM_THREADS = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")

suppressPackageStartupMessages({
  library(readr)
  library(minfi)
})

# Shared progress contract and sample-sheet helpers.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/samplesheet.R")

if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
}


# ── Constants ─────────────────────────────────────────────────────────────────

#' Maximum number of (most variable) probes fed into the PCA. Keeps the SVD fast
#' and memory-bounded while retaining the most informative signal.
MAX_PROBES_FOR_PCA <- 50000L

#' Maximum number of principal components shown.
MAX_PCS <- 10L

#' P-value bins and their colours (most significant -> least), plus the colour
#' used for missing values.
PVAL_THRESHOLDS <- c(1e-10, 1e-5, 0.01, 0.05, 1.01)
PVAL_BIN_COLORS <- c("#c0392b", "#e67e22", "#f39c12", "#f4c2c2", "#f8f8f8")
PVAL_NA_COLOR   <- "#dddddd"


# ── Data loading ──────────────────────────────────────────────────────────────

#' Load, coerce and clean the beta matrix.
#'
#' Accepts either a raw matrix or an S4 minfi object (\code{getBeta} is applied).
#' Probes that are entirely NA are dropped; remaining NAs are mean-imputed per
#' probe so the PCA has a complete matrix.
#'
#' @param beta_path Path to the beta \code{.rds} file.
#' @return A numeric beta matrix (probes x samples) with no NAs.
load_beta_matrix <- function(beta_path) {
  if (!file.exists(beta_path)) {
    emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
  }

  beta <- tryCatch(
    readRDS(beta_path),
    error = function(e) emit_error(paste("Could not read beta matrix:", conditionMessage(e)))
  )
  if (isS4(beta)) {
    beta <- tryCatch(
      minfi::getBeta(beta),
      error = function(e) emit_error(paste("Could not extract beta values:", conditionMessage(e)))
    )
  }
  beta <- as.matrix(beta)
  storage.mode(beta) <- "numeric"

  if (nrow(beta) == 0L || ncol(beta) == 0L) {
    emit_error("Loaded beta matrix contains no features or samples (empty matrix)")
  }

  # Drop all-NA probes (cannot be imputed), then mean-impute remaining NAs.
  all_na <- rowSums(is.na(beta)) == ncol(beta)
  if (any(all_na)) beta <- beta[!all_na, , drop = FALSE]
  if (nrow(beta) == 0L) {
    emit_error("Beta matrix is empty after removing all-NA probes.")
  }
  na_idx <- which(is.na(beta), arr.ind = TRUE)
  if (nrow(na_idx) > 0L) {
    row_means      <- rowMeans(beta, na.rm = TRUE)
    beta[na_idx]   <- row_means[na_idx[, 1L]]
  }

  beta
}

#' Read the sample sheet and align it to the beta-matrix columns.
#'
#' Builds an \code{Array_ID} (from Sentrix columns when present, else positional
#' fallback), intersects it with the beta columns, and reorders both so the
#' samples line up. Requires at least two matching samples.
#'
#' @param sample_sheet_path Path to the sample-sheet CSV.
#' @param beta Beta matrix (probes x samples).
#' @return List with the aligned \code{beta} and \code{samples} data frame.
load_aligned_samples <- function(sample_sheet_path, beta) {
  if (!file.exists(sample_sheet_path)) {
    emit_error(sprintf("Sample sheet file not found at path: %s", sample_sheet_path))
  }

  samples <- tryCatch(
    read_sample_sheet_smart(sample_sheet_path),
    error = function(e) emit_error(sprintf("Failed to parse sample sheet CSV: %s", conditionMessage(e)))
  )

  if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(samples))) {
    samples$Array_ID <- paste0(samples$Sentrix_ID, "_", samples$Sentrix_Position)
  } else {
    warning("Sentrix columns absent; falling back to positional sample matching.")
    samples$Array_ID <- colnames(beta)[seq_len(min(nrow(samples), ncol(beta)))]
  }

  common <- intersect(normalize_id(colnames(beta)), normalize_id(samples$Array_ID))
  if (length(common) < 2L) {
    emit_error(sprintf(
      "Sample ID mismatch: only %d matching samples between dataset and sample sheet (minimum 2).",
      length(common)
    ))
  }

  beta      <- beta[, normalize_id(colnames(beta)) %in% common, drop = FALSE]
  samples   <- samples[normalize_id(samples$Array_ID) %in% common, , drop = FALSE]
  order_idx <- match(normalize_id(samples$Array_ID), normalize_id(colnames(beta)))
  beta      <- beta[, order_idx, drop = FALSE]

  list(beta = beta, samples = samples)
}


# ── PCA & association testing ─────────────────────────────────────────────────

#' Compute principal components on the most variable probes.
#'
#' @param beta Complete beta matrix (probes x samples).
#' @return List with \code{pcs} (samples x n_pcs), \code{var_explained} and
#'   \code{n_pcs}.
compute_principal_components <- function(beta) {
  if (nrow(beta) > MAX_PROBES_FOR_PCA) {
    row_var <- if (requireNamespace("matrixStats", quietly = TRUE)) {
      matrixStats::rowVars(beta)
    } else {
      rowMeans(beta^2) - rowMeans(beta)^2
    }
    top <- order(row_var, decreasing = TRUE)[seq_len(MAX_PROBES_FOR_PCA)]
    beta <- beta[top, , drop = FALSE]
  }

  pca <- tryCatch(
    prcomp(t(beta), center = TRUE, scale. = FALSE),
    error = function(e) emit_error(paste("PCA (SVD) failed:", conditionMessage(e)))
  )

  n_pcs <- min(MAX_PCS, ncol(pca$x))
  list(
    pcs           = pca$x[, seq_len(n_pcs), drop = FALSE],
    var_explained = round(100 * pca$sdev[seq_len(n_pcs)]^2 / sum(pca$sdev^2), 1),
    n_pcs         = n_pcs
  )
}

#' Select the sample-sheet columns usable as grouping variables.
#'
#' A column qualifies when it has at least two and fewer than \code{n_samples}
#' distinct non-empty values (constants and unique-per-sample ids are excluded).
#'
#' @param samples Aligned sample-sheet data frame.
#' @param n_samples Number of samples.
#' @return Named list of integer factor vectors, one per grouping variable.
select_grouping_variables <- function(samples, n_samples) {
  candidate_cols <- setdiff(colnames(samples), "Array_ID")
  var_factors <- list()
  for (col in candidate_cols) {
    values     <- as.character(samples[[col]])
    nonempty   <- values[!is.na(values) & nzchar(trimws(values))]
    n_distinct <- length(unique(nonempty))
    if (n_distinct >= 2L && n_distinct < n_samples) {
      var_factors[[col]] <- as.integer(factor(values))
    }
  }
  var_factors
}

#' Kruskal-Wallis p-value for a grouping vs. a PC score (NA on failure).
#'
#' @param group_vec Grouping vector (coerced to factor).
#' @param pc_vec Numeric principal-component scores.
#' @return The p-value, or \code{NA_real_} when not computable.
association_pvalue <- function(group_vec, pc_vec) {
  group_vec <- as.factor(group_vec)
  if (nlevels(group_vec) < 2L) return(NA_real_)
  tryCatch(kruskal.test(pc_vec ~ group_vec)$p.value, error = function(e) NA_real_)
}

#' Build the variable x PC p-value matrix.
#'
#' @param var_factors Named list of grouping vectors.
#' @param pcs Principal-component score matrix (samples x n_pcs).
#' @param n_pcs Number of components.
#' @return A p-value matrix with informative dimnames (a placeholder row when no
#'   grouping variable exists).
compute_pvalue_matrix <- function(var_factors, pcs, n_pcs) {
  var_names <- names(var_factors)
  n_vars    <- length(var_names)

  pval_mat <- matrix(
    NA_real_, nrow = max(n_vars, 1L), ncol = n_pcs,
    dimnames = list(if (n_vars > 0L) var_names else "—", paste0("PC-", seq_len(n_pcs)))
  )
  if (n_vars > 0L) {
    for (i in seq_len(n_vars)) {
      for (pc_idx in seq_len(n_pcs)) {
        pval_mat[i, pc_idx] <- association_pvalue(var_factors[[var_names[i]]], pcs[, pc_idx])
      }
    }
  }
  pval_mat
}

#' Map a p-value to its bin colour.
#'
#' @param p A p-value (may be NA).
#' @return A hex colour string.
pvalue_to_color <- function(p) {
  if (is.na(p)) return(PVAL_NA_COLOR)
  for (i in seq_along(PVAL_THRESHOLDS)) if (p < PVAL_THRESHOLDS[i]) return(PVAL_BIN_COLORS[i])
  PVAL_BIN_COLORS[length(PVAL_BIN_COLORS)]
}


# ── Rendering ─────────────────────────────────────────────────────────────────

#' Render the SVD association heatmap to PNG and PDF.
#'
#' The figure is sized dynamically from the number of PCs and variables so every
#' cell, label and the legend stay fully visible and legible — and it scales
#' safely as more samples (hence more PCs, capped at \code{MAX_PCS}) are added.
#' Graphics devices are always closed, even if drawing fails.
#'
#' @param pval_mat Variable x PC p-value matrix.
#' @param var_explained Percent variance explained per PC.
#' @param n_pcs Number of components.
#' @param n_vars Number of grouping variables (0 -> "no variables" notice).
#' @param png_path,pdf_path Output paths.
#' @return Invisibly \code{TRUE}.
render_svd_heatmap <- function(pval_mat, var_explained, n_pcs, n_vars, png_path, pdf_path) {
  color_mat <- matrix(
    vapply(pval_mat, pvalue_to_color, character(1)),
    nrow = nrow(pval_mat), ncol = ncol(pval_mat), dimnames = dimnames(pval_mat)
  )

  # ── Dynamic geometry (inches) ───────────────────────────────────────────────
  max_label <- max(nchar(rownames(pval_mat)), 6L)
  cell_w    <- 1.0                                   # per PC column
  cell_h    <- 0.52                                  # per variable row
  left_in   <- min(3.8, 0.09 * max_label + 0.8)      # room for row labels
  top_in    <- 1.9                                   # raised title + 2-line PC headers
  bottom_in <- 1.25                                  # legend below the matrix
  right_in  <- 0.7
  # Generous minimums so a 1-PC / 1-variable figure is never a thin sliver.
  plot_w    <- max(n_pcs        * cell_w, 4.0)
  plot_h    <- max(nrow(pval_mat) * cell_h, 1.8)
  W         <- max(left_in + plot_w + right_in, 8.0) # >= 8" guarantees the legend fits
  H         <- top_in + plot_h + bottom_in

  draw <- function() {
    par(mai = c(bottom_in, left_in, top_in, right_in), xpd = FALSE)
    plot(0, 0, type = "n",
         xlim = c(0.5, n_pcs + 0.5), ylim = c(0.5, nrow(pval_mat) + 0.5),
         axes = FALSE, xlab = "", ylab = "")

    for (r in seq_len(nrow(pval_mat))) {
      yrow <- nrow(pval_mat) - r + 1                 # first variable on top
      for (cc in seq_len(n_pcs)) {
        rect(cc - 0.5, yrow - 0.5, cc + 0.5, yrow + 0.5,
             col = color_mat[r, cc], border = "white", lwd = 1.2)
        p <- pval_mat[r, cc]
        if (n_vars == 0L) {
          next
        } else if (is.na(p)) {
          text(cc, yrow, "n/a", cex = 0.75, col = "#888888")
        } else {
          txt <- if (p < 0.001) formatC(p, format = "e", digits = 1) else sprintf("%.3f", p)
          text(cc, yrow, txt, cex = 0.8, col = if (p < 1e-5) "white" else "black")
        }
      }
    }

    axis(3, at = seq_len(n_pcs),
         labels = paste0("PC-", seq_len(n_pcs), "\n(", var_explained, "%)"),
         tick = FALSE, las = 1, cex.axis = 0.95, line = -0.5)
    axis(2, at = nrow(pval_mat):1, labels = rownames(pval_mat),
         tick = FALSE, las = 2, cex.axis = 1.0, line = -0.5)

    # Title raised clear of the PC-column headers.
    mtext("SVD association  (variables × principal components)",
          side = 3, line = 3.6, font = 2, cex = 1.3, xpd = NA)

    if (n_vars == 0L) {
      text(mean(c(0.5, n_pcs + 0.5)), mean(c(0.5, nrow(pval_mat) + 0.5)),
           "No grouping variables found in the sample sheet.", cex = 1.0, col = "#555555")
    }

    legend(x = grconvertX(0.5, "ndc", "user"), y = grconvertY(0.02, "ndc", "user"),
           xjust = 0.5, yjust = 0, horiz = TRUE, bty = "n", xpd = NA, cex = 0.9,
           legend = c("p<1e-10", "p<1e-5", "p<0.01", "p<0.05", "p>=0.05"),
           fill = PVAL_BIN_COLORS, border = "white")
  }

  # PNG (primary, shown in the UI) — fatal if it cannot be written.
  ok <- tryCatch({
    png(png_path, width = W, height = H, units = "in", res = 200, type = "cairo")
    tryCatch(draw(), finally = dev.off())
    TRUE
  }, error = function(e) {
    try(dev.off(), silent = TRUE)
    emit_error(paste("Failed to render SVD heatmap PNG:", conditionMessage(e)))
    FALSE
  })
  if (!isTRUE(ok) || !file.exists(png_path)) {
    emit_error("SVD heatmap PNG was not created.")
  }

  # PDF (publication) — non-fatal: a missing PDF only disables the download.
  tryCatch({
    if (capabilities("cairo")) cairo_pdf(pdf_path, width = W, height = H)
    else pdf(pdf_path, width = W, height = H)
    tryCatch(draw(), finally = dev.off())
  }, error = function(e) {
    try(dev.off(), silent = TRUE)
    emit_progress(96, paste0("PDF export skipped: ", conditionMessage(e)))
  })

  invisible(TRUE)
}


# ── Main execution ────────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 3L) {
  emit_error("Insufficient arguments. Usage: Rscript batch_svd.R <beta_path> <sample_sheet_path> <job_dir> [<png_name>]")
}

beta_path         <- normalizePath(args[1], mustWork = FALSE)
sample_sheet_path <- normalizePath(args[2], mustWork = FALSE)
job_dir           <- normalizePath(args[3], mustWork = FALSE)
png_name          <- if (length(args) >= 4L) args[4] else "svd_plot.png"
pdf_name          <- sub("\\.png$", ".pdf", png_name, ignore.case = TRUE)

dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)

emit_progress(0, "Initializing SVD analysis workflow")

emit_progress(15, "Loading and validating methylation beta matrix")
beta <- load_beta_matrix(beta_path)

emit_progress(35, "Loading and verifying sample sheet metadata")
aligned <- load_aligned_samples(sample_sheet_path, beta)
beta    <- aligned$beta
samples <- aligned$samples
n_samples <- ncol(beta)
emit_progress(50, sprintf("Aligned %d samples between dataset and sample sheet", n_samples))

emit_progress(70, "Computing Singular Value Decomposition (SVD) principal components")
pca_res       <- compute_principal_components(beta)
pcs           <- pca_res$pcs
var_explained <- pca_res$var_explained
n_pcs         <- pca_res$n_pcs

emit_progress(85, "Selecting grouping variables and testing associations")
var_factors <- select_grouping_variables(samples, n_samples)
n_vars      <- length(var_factors)
pval_mat    <- compute_pvalue_matrix(var_factors, pcs, n_pcs)

emit_progress(95, "Rendering SVD heatmap (PNG + PDF)")
png_path <- file.path(job_dir, png_name)
pdf_path <- file.path(job_dir, pdf_name)
render_svd_heatmap(pval_mat, var_explained, n_pcs, n_vars, png_path, pdf_path)

emit_progress(100, "SVD heatmap complete")
emit_done(plot_file = png_name)

quit(save = "no", status = 0)
