#' ── Pakete ────────────────────────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(readr)
  library(minfi)
})

# ── Progress-Vertrag einbinden ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")

# ── Shared sample-sheet helpers ───────────────────────────────────────────────
source("/app/r_backend/utils/samplesheet.R")

#' ── Argumente ─────────────────────────────────────────────────────────────────
# Usage: Rscript batch_svd.R <beta_path> <sample_sheet_path> <job_dir> [<png_name>]
# Renders the SVD association heatmap (variables × principal components) as a
# static figure: a PNG for inline display and a vector PDF for publication
# download. Works with ARBITRARY sample-sheet column names — every column that
# groups the samples becomes a row, no hardcoded biological/technical column.
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  emit_error("Insufficient arguments. Usage: Rscript batch_svd.R <beta_path> <sample_sheet_path> <job_dir> [<png_name>]")
}

beta_path         <- normalizePath(args[1], mustWork = FALSE)
sample_sheet_path <- normalizePath(args[2], mustWork = FALSE)
job_dir           <- normalizePath(args[3], mustWork = FALSE)
png_name          <- if (length(args) >= 4) args[4] else "svd_plot.png"
pdf_name          <- sub("\\.png$", ".pdf", png_name, ignore.case = TRUE)

dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)

emit_progress(0, "Initializing SVD analysis workflow")

#' ── Beta-Matrix laden ─────────────────────────────────────────────────────────
emit_progress(15, "Loading and validating methylation beta matrix")

if (!file.exists(beta_path)) {
  emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
}

beta <- readRDS(beta_path)
if (isS4(beta)) beta <- minfi::getBeta(beta)
beta <- as.matrix(beta)

if (nrow(beta) == 0 || ncol(beta) == 0) {
  emit_error("Loaded beta matrix contains no features or samples (empty matrix)")
}

na_rows <- which(apply(beta, 1, function(r) any(is.na(r))))
if (length(na_rows) > 0) {
  for (i in na_rows) beta[i, is.na(beta[i, ])] <- mean(beta[i, ], na.rm = TRUE)
}

#' ── Sample Sheet laden ────────────────────────────────────────────────────────
emit_progress(35, "Loading and verifying sample sheet metadata")

if (!file.exists(sample_sheet_path)) {
  emit_error(sprintf("Sample sheet file not found at path: %s", sample_sheet_path))
}

samples <- tryCatch(
  read_sample_sheet_smart(sample_sheet_path),
  error = function(e) emit_error(sprintf("Failed to parse sample sheet CSV: %s", e$message))
)

if (all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(samples))) {
  samples$Array_ID <- paste0(samples$Sentrix_ID, "_", samples$Sentrix_Position)
} else {
  samples$Array_ID <- colnames(beta)[seq_len(min(nrow(samples), ncol(beta)))]
}

#' ── Sample-Abgleich ───────────────────────────────────────────────────────────
emit_progress(50, "Aligning sample sheet IDs with beta matrix columns")

beta_ids   <- normalize_id(colnames(beta))
sample_ids <- normalize_id(samples$Array_ID)
common     <- intersect(beta_ids, sample_ids)

if (length(common) < 2) {
  emit_error(sprintf(
    "Sample ID mismatch: only %d matching samples between dataset and sample sheet (minimum 2).",
    length(common)
  ))
}

beta      <- beta[, normalize_id(colnames(beta)) %in% common, drop = FALSE]
samples   <- samples[normalize_id(samples$Array_ID) %in% common, , drop = FALSE]
order_idx <- match(normalize_id(samples$Array_ID), normalize_id(colnames(beta)))
beta      <- beta[, order_idx, drop = FALSE]

n_samples <- ncol(beta)

#' ── PCA (SVD-Zerlegung) ───────────────────────────────────────────────────────
emit_progress(70, "Computing Singular Value Decomposition (SVD) principal components")

max_probes <- 50000
if (nrow(beta) > max_probes) {
  row_vars     <- rowMeans(beta^2) - rowMeans(beta)^2
  top_probes   <- order(row_vars, decreasing = TRUE)[1:max_probes]
  beta_for_pca <- beta[top_probes, , drop = FALSE]
} else {
  beta_for_pca <- beta
}

pca   <- prcomp(t(beta_for_pca), center = TRUE, scale. = FALSE)
n_pcs <- min(10, ncol(pca$x))
pcs   <- pca$x[, seq_len(n_pcs), drop = FALSE]
var_explained <- round(100 * pca$sdev[seq_len(n_pcs)]^2 / sum(pca$sdev^2), 1)

#' ── Variablen bestimmen (generisch) ───────────────────────────────────────────
# Every column that groups the samples (>= 2 distinct values, not one per
# sample) becomes a row. No hardcoded Sample_Group, no technical whitelist.
emit_progress(85, "Selecting grouping variables and testing associations")

candidate_cols <- setdiff(colnames(samples), "Array_ID")
var_factors <- list()
for (col in candidate_cols) {
  values     <- as.character(samples[[col]])
  values     <- values[!is.na(values) & nzchar(trimws(values))]
  n_distinct <- length(unique(values))
  if (n_distinct >= 2 && n_distinct < n_samples) {
    var_factors[[col]] <- as.integer(factor(as.character(samples[[col]])))
  }
}

#' ── Kruskal-Wallis p-Werte ────────────────────────────────────────────────────
get_pval <- function(group_vec, pc_vec) {
  group_vec <- as.factor(group_vec)
  if (nlevels(group_vec) < 2) return(NA_real_)
  tryCatch(kruskal.test(pc_vec ~ group_vec)$p.value, error = function(e) NA_real_)
}

var_names <- names(var_factors)
n_vars    <- length(var_names)

pval_mat <- matrix(
  NA_real_, nrow = max(n_vars, 1), ncol = n_pcs,
  dimnames = list(if (n_vars > 0) var_names else "—", paste0("PC-", seq_len(n_pcs)))
)
if (n_vars > 0) {
  for (i in seq_len(n_vars)) {
    for (pc_idx in seq_len(n_pcs)) {
      pval_mat[i, pc_idx] <- get_pval(var_factors[[var_names[i]]], pcs[, pc_idx])
    }
  }
}

#' ── Farbskala ─────────────────────────────────────────────────────────────────
thresholds <- c(1e-10, 1e-5, 0.01, 0.05, 1.01)
bin_colors <- c("#c0392b", "#e67e22", "#f39c12", "#f4c2c2", "#f8f8f8")

pval_to_color <- function(p) {
  if (is.na(p)) return("#dddddd")
  for (i in seq_along(thresholds)) if (p < thresholds[i]) return(bin_colors[i])
  bin_colors[length(bin_colors)]
}
color_mat <- matrix(
  vapply(pval_mat, pval_to_color, character(1)),
  nrow = nrow(pval_mat), ncol = ncol(pval_mat), dimnames = dimnames(pval_mat)
)

#' ── Heatmap zeichnen (PNG + PDF aus einer Matrix) ─────────────────────────────
emit_progress(95, "Rendering SVD heatmap (PNG + PDF)")

# Dynamic size so every PC column and every (possibly long) row label is fully
# visible — never clipped — and large enough to read in print.
max_label  <- max(nchar(rownames(pval_mat)), 6L)
cell_w     <- 0.95                              # inches per PC column
cell_h     <- 0.46                              # inches per variable row
left_in    <- min(3.4, 0.085 * max_label + 0.7) # room for row labels
top_in     <- 1.35                              # title + PC headers
bottom_in  <- 1.15                              # legend below the matrix
right_in   <- 0.6
plot_w     <- max(n_pcs * cell_w, 3)
plot_h     <- max(nrow(pval_mat) * cell_h, 1)
W          <- left_in + plot_w + right_in
H          <- top_in + plot_h + bottom_in

draw_heatmap <- function() {
  par(mai = c(bottom_in, left_in, top_in, right_in), xpd = FALSE)
  plot(0, 0, type = "n",
       xlim = c(0.5, n_pcs + 0.5), ylim = c(0.5, nrow(pval_mat) + 0.5),
       axes = FALSE, xlab = "", ylab = "")

  for (r in seq_len(nrow(pval_mat))) {
    yrow <- nrow(pval_mat) - r + 1                # first variable on top
    for (cc in seq_len(n_pcs)) {
      rect(cc - 0.5, yrow - 0.5, cc + 0.5, yrow + 0.5,
           col = color_mat[r, cc], border = "white", lwd = 1.2)
      p <- pval_mat[r, cc]
      if (n_vars == 0) {
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

  mtext("SVD association  (variables × principal components)",
        side = 3, line = 2.4, font = 2, cex = 1.25, xpd = NA)

  if (n_vars == 0) {
    text(mean(c(0.5, n_pcs + 0.5)), mean(c(0.5, nrow(pval_mat) + 0.5)),
         "No grouping variables found in the sample sheet.", cex = 1.0, col = "#555555")
  }

  legend(x = grconvertX(0.5, "ndc", "user"), y = grconvertY(0.02, "ndc", "user"),
         xjust = 0.5, yjust = 0, horiz = TRUE, bty = "n", xpd = NA, cex = 0.9,
         legend = c("p<1e-10", "p<1e-5", "p<0.01", "p<0.05", "p>=0.05"),
         fill = bin_colors, border = "white")
}

png_path <- file.path(job_dir, png_name)
png(png_path, width = W, height = H, units = "in", res = 200, type = "cairo")
draw_heatmap()
dev.off()

pdf_path <- file.path(job_dir, pdf_name)
tryCatch(
  {
    if (capabilities("cairo")) cairo_pdf(pdf_path, width = W, height = H)
    else pdf(pdf_path, width = W, height = H)
    draw_heatmap()
    dev.off()
  },
  error = function(e) emit_progress(96, paste0("PDF export skipped: ", e$message))
)

emit_progress(100, "SVD heatmap complete")
emit_done(plot_file = png_name)

quit(save = "no", status = 0)
