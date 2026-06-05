#' ── Pakete ────────────────────────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(jsonlite)
  library(readr)
  library(minfi)
})

# ── Progress-Vertrag einbinden ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")

#' ── Sample Sheet einlesen ─────────────────────────────────────────────────────
read_sample_sheet_smart <- function(path) {
  lines <- readLines(path, warn = FALSE)
  
  # Suche Start der eigentlichen Daten
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0
  
  read_csv(path, skip = skip_n, show_col_types = FALSE)
}

#' ── ID-Normalisierung ─────────────────────────────────────────────────────────
normalize_id <- function(x) {
  x <- as.character(x)
  trimws(x)
  x <- gsub("[[:space:]]+", "", x)
  x <- gsub("\r|\n|\t", "", x)
  x
}

#' ── Argumente ─────────────────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  emit_error("Insufficient arguments. Usage: Rscript batch_svd.R <beta_path> <sample_sheet_path> <job_dir> [<plot_name>]")
}

beta_path         <- normalizePath(args[1], mustWork = FALSE)
sample_sheet_path <- normalizePath(args[2], mustWork = FALSE)
job_dir           <- normalizePath(args[3], mustWork = FALSE)
plot_name         <- if (length(args) >= 4) args[4] else "svd_plot.png"

dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)

# Initialisierung an Backend melden
emit_progress(0, "Initializing SVD analysis workflow")

#' ── Beta-Matrix laden ─────────────────────────────────────────────────────────
emit_progress(15, "Loading and validating methylation beta matrix")

if (!file.exists(beta_path)) {
  emit_error(sprintf("Beta matrix file not found at path: %s", beta_path))
}

beta <- readRDS(beta_path)

# Falls es ein Bioconductor/minfi S4-Objekt ist, die Beta-Matrix korrekt extrahieren
if (isS4(beta)) {
  beta <- minfi::getBeta(beta)
}

beta <- as.matrix(beta)

if (nrow(beta) == 0 || ncol(beta) == 0) {
  emit_error("Loaded beta matrix contains no features or samples (empty matrix)")
}

# NA-Imputation pro Probe (Zeile)
na_rows <- which(apply(beta, 1, function(r) any(is.na(r))))
if (length(na_rows) > 0) {
  for (i in na_rows) {
    beta[i, is.na(beta[i, ])] <- mean(beta[i, ], na.rm = TRUE)
  }
}

#' ── Sample Sheet laden ────────────────────────────────────────────────────────
emit_progress(35, "Loading and verifying sample sheet metadata")

if (!file.exists(sample_sheet_path)) {
  emit_error(sprintf("Sample sheet file not found at path: %s", sample_sheet_path))
}

samples <- tryCatch(
  read_sample_sheet_smart(sample_sheet_path),
  error = function(e) {
    emit_error(sprintf("Failed to parse sample sheet CSV: %s", e$message))
  }
)

required_cols <- c("Sentrix_ID", "Sentrix_Position", "Sample_Group")
missing_cols  <- setdiff(required_cols, colnames(samples))

if (length(missing_cols) > 0) {
  emit_error(sprintf("Sample sheet is missing required columns: %s", paste(missing_cols, collapse = ", ")))
}

# Kombinierte Array-ID (Chip + Position)
samples$Array_ID <- paste0(samples$Sentrix_ID, "_", samples$Sentrix_Position)

#' ── Sample-Abgleich ───────────────────────────────────────────────────────────
emit_progress(50, "Aligning sample sheet IDs with beta matrix columns")

beta_ids   <- normalize_id(colnames(beta))
sample_ids <- normalize_id(samples$Array_ID)

common <- intersect(beta_ids, sample_ids)

if (length(common) < 2) {
  emit_error(sprintf("Sample ID mismatch: Only found %d matching samples between dataset and sample sheet. Minimum of 2 required.", length(common)))
}

# Subsetting + gleiche Reihenfolge herstellen
beta    <- beta[, normalize_id(colnames(beta)) %in% common, drop = FALSE]
samples <- samples[normalize_id(samples$Array_ID) %in% common, , drop = FALSE]

order_idx <- match(normalize_id(samples$Array_ID), normalize_id(colnames(beta)))
beta      <- beta[, order_idx, drop = FALSE]

#' ── Gruppenvalidierung ────────────────────────────────────────────────────────
samples$Sample_Group <- factor(samples$Sample_Group)

if (nlevels(samples$Sample_Group) < 2) {
  emit_error("Statistical validation failed: Sample_Group must contain at least 2 distinct experimental groups.")
}

#' ── PCA (SVD-Zerlegung mit ChAMP & EPICv2 Optimierung) ────────────────────────
emit_progress(70, "Computing Singular Value Decomposition (SVD) principal components")

# EPICv2 Skalierbarkeit & Memory-Overflow Schutz
max_probes <- 50000
if (nrow(beta) > max_probes) {
  # Vektorisierte Varianzberechnung: Var = E[X^2] - E[X]^2
  row_vars <- rowMeans(beta^2) - rowMeans(beta)^2
  top_probes <- order(row_vars, decreasing = TRUE)[1:max_probes]
  beta_for_pca <- beta[top_probes, , drop = FALSE]
} else {
  beta_for_pca <- beta
}

# Ausrichtung an ChAMP-Referenz-SVD (Zentriert, unskaliert)
pca    <- prcomp(t(beta_for_pca), center = TRUE, scale. = FALSE)
n_pcs  <- min(10, ncol(pca$x))
pcs    <- pca$x[, seq_len(n_pcs), drop = FALSE]

var_explained <- round(100 * pca$sdev[seq_len(n_pcs)]^2 / sum(pca$sdev^2), 1)

#' ── Technische Variablen bestimmen ────────────────────────────────────────────
tech_vars <- list()
tech_whitelist <- c("Sentrix_ID", "Sentrix_Position", "Sample_Well", "Sample_Plate", 
                    "Pool_ID", "Batch", "Run", "Box", "Plate", "Processing_Date")

# Standard-Illumina Batch-Faktoren zuweisen
tech_vars[["Slide (Sentrix_ID)"]] <- as.integer(factor(samples$Sentrix_ID))
tech_vars[["Array (Sentrix_Position)"]] <- as.integer(factor(samples$Sentrix_Position))

if ("Sample_Well" %in% colnames(samples) && length(unique(samples$Sample_Well)) > 1) {
  tech_vars[["Sample_Well"]] <- as.integer(factor(samples$Sample_Well))
}
if ("Sample_Plate" %in% colnames(samples) && length(unique(samples$Sample_Plate)) > 1) {
  tech_vars[["Sample_Plate"]] <- as.integer(factor(samples$Sample_Plate))
}

extra_candidates <- intersect(colnames(samples), tech_whitelist)
extra_candidates <- setdiff(
  extra_candidates,
  c("Sentrix_ID", "Sentrix_Position", "Array_ID", "Sample_Group",
    "Sample_Well", "Sample_Plate", "Sample_Name", "Sample_ID")
)

for (col in extra_candidates) {
  v <- samples[[col]]
  if (length(unique(v[!is.na(v)])) >= 2) {
    tech_vars[[col]] <- as.integer(factor(v))
  }
}

# Fachliche Validierungsprüfung
if ("Sample_Group" %in% names(tech_vars)) {
  emit_error("Pipeline validation breach: Biological factor 'Sample_Group' detected inside technical batch variables list!")
}

#' ── Kruskal-Wallis p-Werte berechnen ─────────────────────────────────────────
emit_progress(85, "Performing Kruskal-Wallis association tests across factors")

get_pval <- function(group_vec, pc_vec) {
  group_vec <- as.factor(group_vec)
  if (nlevels(group_vec) < 2) return(NA_real_)
  
  tryCatch(
    kruskal.test(pc_vec ~ group_vec)$p.value,
    error = function(e) NA_real_
  )
}

pval_mat <- matrix(
  NA_real_,
  nrow = length(tech_vars),
  ncol = n_pcs,
  dimnames = list(names(tech_vars), paste0("PC-", seq_len(n_pcs)))
)

for (var_name in names(tech_vars)) {
  for (pc_idx in seq_len(n_pcs)) {
    pval_mat[var_name, pc_idx] <- get_pval(
      tech_vars[[var_name]],
      pcs[, pc_idx]
    )
  }
}

#' ── Farbcodierung der Signifikanz ─────────────────────────────────────────────
thresholds <- c(1e-10, 1e-5, 0.01, 0.05, 1.01)
colors <- c("#c0392b", "#e67e22", "#f39c12", "#f4c2c2", "#f8f8f8")

pval_to_color <- function(p) {
  if (is.na(p)) return("#dddddd")
  for (i in seq_along(thresholds)) {
    if (p < thresholds[i]) return(colors[i])
  }
  colors[length(colors)]
}

color_mat <- matrix(
  vapply(pval_mat, pval_to_color, character(1)),
  nrow = nrow(pval_mat),
  ncol = ncol(pval_mat),
  dimnames = dimnames(pval_mat)
)

#' ── SVD-Assoziationsplot erzeugen ─────────────────────────────────────────────
emit_progress(95, "Rendering SVD association heatmap plot asset")

plot_path <- file.path(job_dir, plot_name)
n_vars <- nrow(pval_mat)
n_pcs_plot <- n_pcs

img_w <- max(1100, 120 * n_pcs_plot + 450)
img_h <- max(650,  120 * n_vars + 350)

png(plot_path, width = img_w, height = img_h, res = 150)
on.exit(dev.off(), add = TRUE)

par(
  mar = c(6, 16, 5, 13),
  xpd = TRUE
)

plot(
  0, 0,
  type = "n",
  xlim = c(0.5, n_pcs_plot + 0.5),
  ylim = c(0.5, n_vars + 0.5),
  axes = FALSE,
  xlab = "",
  ylab = "",
  main = ""
)

for (r in seq_len(n_vars)) {
  for (c in seq_len(n_pcs_plot)) {
    rect(
      xleft = c - 0.45,
      xright = c + 0.45,
      ybottom = r - 0.45,
      ytop = r + 0.45,
      col = color_mat[r, c],
      border = "white",
      lwd = 1.5
    )
    
    p_val <- pval_mat[r, c]
    if (!is.na(p_val)) {
      p_text <- if (p_val < 0.001) formatC(p_val, format = "e", digits = 1) else sprintf("%.3f", p_val)
      text_col <- if (p_val < 1e-5) "white" else "black"
      
      text(x = c, y = r, labels = p_text, col = text_col, cex = 0.7)
    }
  }
}

pc_labels <- paste0("PC-", seq_len(n_pcs_plot), "\n(", var_explained, "%)")

axis(side = 1, at = seq_len(n_pcs_plot), labels = pc_labels, las = 1, tick = FALSE, cex.axis = 0.85, line = 0.5)
axis(side = 2, at = seq_len(n_vars), labels = rownames(pval_mat), las = 2, tick = FALSE, cex.axis = 0.9, line = 0.5)

mtext("Singular Value Decomposition Analysis (SVD)", side = 3, line = 2, cex = 1.2, font = 2)

legend_labels <- c(
  expression(p < 1 %*% 10^{-10}),
  expression(p < 1 %*% 10^{-5}),
  "p < 0.01",
  "p < 0.05",
  "p > 0.05"
)

legend(
  x = n_pcs_plot + 0.8,
  y = n_vars + 0.5,
  legend = legend_labels,
  fill = colors,
  border = "white",
  bty = "n",
  cex = 0.8,
  xjust = 0,
  yjust = 1
)

# Erfolgsevents an Backend übermitteln
emit_progress(100, "SVD analysis and plot generation complete")
emit_done(plot_file = plot_name)

quit(save = "no", status = 0)