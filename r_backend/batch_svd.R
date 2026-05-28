#' ── Pakete ────────────────────────────────────────────────────────────────────
#'
#' Lädt alle benötigten Pakete für die Analyse.
#' Startup-Meldungen werden unterdrückt, um sauberes Logging zu ermöglichen.
suppressPackageStartupMessages({
  library(jsonlite)
  library(readr)
})

#' ── Logging ───────────────────────────────────────────────────────────────────
#'
#' Gibt strukturierte Log-Meldungen als JSON aus (für Pipeline-Parsing).
#'
#' @param status Status der Meldung (z. B. "running", "done", "error", "warning")
#' @param message Text der Log-Meldung
#' @param step Optional: aktueller Pipeline-Schritt
log_msg <- function(status, message, step = NULL) {
  cat(
    jsonlite::toJSON(
      list(status = status, step = step, message = message),
      auto_unbox = TRUE
    ),
    "\n"
  )
}

#' Beendet das Skript mit einer strukturierten Fehlermeldung.
#'
#' @param message Fehlerbeschreibung
#' @param step Optional: Pipeline-Schritt, in dem der Fehler auftrat
exit_with_error <- function(message, step = NULL) {
  log_msg("error", message, step)
  quit(save = "no", status = 1)
}

#' ── Sample Sheet einlesen ─────────────────────────────────────────────────────
#'
#' Liest Illumina Sample Sheets robust ein, indem automatisch bis zur [Data]-Sektion geskippt wird.
#'
#' @param path Pfad zur Sample-Sheet-Datei
#' @return data.frame mit Sample-Annotationen
read_sample_sheet_smart <- function(path) {
  lines <- readLines(path, warn = FALSE)
  
  # Suche Start der eigentlichen Daten
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0
  
  read_csv(path, skip = skip_n, show_col_types = FALSE)
}

#' ── ID-Normalisierung ─────────────────────────────────────────────────────────
#'
#' Bereinigt Sample-IDs für konsistente Matching-Operationen.
#' Entfernt Whitespace, Tabs und Zeilenumbrüche.
#'
#' @param x Vektor von IDs
#' @return bereinigter Character-Vektor
normalize_id <- function(x) {
  x <- as.character(x)
  x <- trimws(x)
  x <- gsub("[[:space:]]+", "", x)
  x <- gsub("\r|\n|\t", "", x)
  x
}

#' ── Argumente ─────────────────────────────────────────────────────────────────
#'
#' Erwartet drei Kommandozeilenargumente:
#' beta_matrix, sample_sheet, output_dir
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  exit_with_error(
    "Usage: Rscript batch_svd.R <beta_path> <sample_sheet_path> <job_dir>",
    "args"
  )
}

beta_path         <- normalizePath(args[1], mustWork = FALSE)
sample_sheet_path <- normalizePath(args[2], mustWork = FALSE)
job_dir           <- normalizePath(args[3], mustWork = FALSE)

dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)

#' ── Beta-Matrix laden ─────────────────────────────────────────────────────────
#'
#' Lädt gespeicherte Beta-Werte und führt einfache Qualitätschecks durch.
log_msg("running", "loading beta matrix", "load_beta")

if (!file.exists(beta_path)) {
  exit_with_error(paste("Beta file not found:", beta_path), "load_beta")
}

beta <- readRDS(beta_path)
beta <- as.matrix(beta)

if (nrow(beta) == 0 || ncol(beta) == 0) {
  exit_with_error("Beta matrix is empty", "load_beta")
}

# NA-Imputation pro Probe (Zeile)
na_rows <- which(apply(beta, 1, function(r) any(is.na(r))))
if (length(na_rows) > 0) {
  log_msg("warning", paste(length(na_rows), "rows with NA imputed"), "load_beta")
  
  for (i in na_rows) {
    beta[i, is.na(beta[i, ])] <- mean(beta[i, ], na.rm = TRUE)
  }
}

#' ── Sample Sheet laden ────────────────────────────────────────────────────────
log_msg("running", "loading sample sheet", "load_samples")

if (!file.exists(sample_sheet_path)) {
  exit_with_error(paste("Sample sheet not found:", sample_sheet_path), "load_samples")
}

samples <- tryCatch(
  read_sample_sheet_smart(sample_sheet_path),
  error = function(e) {
    exit_with_error(paste("Cannot read sample sheet:", e$message), "load_samples")
  }
)

required_cols <- c("Sentrix_ID", "Sentrix_Position", "Sample_Group")
missing_cols  <- setdiff(required_cols, colnames(samples))

if (length(missing_cols) > 0) {
  exit_with_error(
    paste("Missing columns:", paste(missing_cols, collapse = ", ")),
    "validate_samples"
  )
}

# Kombinierte Array-ID (Chip + Position)
samples$Array_ID <- paste0(samples$Sentrix_ID, "_", samples$Sentrix_Position)

#' ── Sample-Abgleich ───────────────────────────────────────────────────────────
log_msg("running", "aligning beta and sample sheet", "align")

beta_ids   <- normalize_id(colnames(beta))
sample_ids <- normalize_id(samples$Array_ID)

common <- intersect(beta_ids, sample_ids)
log_msg("debug", paste0("common samples: ", length(common)), "align")

if (length(common) < 2) {
  exit_with_error(
    paste0("Only ", length(common), " matching sample IDs. Need at least 2."),
    "align"
  )
}

# Subsetting + gleiche Reihenfolge herstellen
beta    <- beta[, normalize_id(colnames(beta)) %in% common, drop = FALSE]
samples <- samples[normalize_id(samples$Array_ID) %in% common, , drop = FALSE]

order_idx <- match(normalize_id(samples$Array_ID), normalize_id(colnames(beta)))
beta      <- beta[, order_idx, drop = FALSE]

#' ── Gruppenvalidierung ────────────────────────────────────────────────────────
samples$Sample_Group <- factor(samples$Sample_Group)

if (nlevels(samples$Sample_Group) < 2) {
  exit_with_error("Need >= 2 groups in Sample_Group", "validate_groups")
}

#' ── PCA (SVD-ähnliche Zerlegung der Methylationsmatrix) ───────────────────────
log_msg("running", "computing PCA", "svd")

pca    <- prcomp(t(beta), center = TRUE, scale. = FALSE)
n_pcs  <- min(10, ncol(pca$x))
pcs    <- pca$x[, seq_len(n_pcs), drop = FALSE]

var_explained <- round(100 * pca$sdev[seq_len(n_pcs)]^2 / sum(pca$sdev^2), 1)

#' ── Technische Variablen bestimmen ────────────────────────────────────────────
#'
#' Extraktion potenzieller Batch-Effekte aus Sample Sheet.
tech_vars <- list()

tech_vars[["Slide"]] <- as.integer(factor(samples$Sentrix_ID))
tech_vars[["Array"]] <- as.integer(factor(samples$Sentrix_Position))

if ("Sample_Well" %in% colnames(samples) &&
    length(unique(samples$Sample_Well)) > 1) {
  tech_vars[["Sample_Well"]] <- as.integer(factor(samples$Sample_Well))
}

tech_vars[["Sample_Group"]] <- as.integer(samples$Sample_Group)

extra_candidates <- setdiff(
  colnames(samples),
  c("Sentrix_ID", "Sentrix_Position", "Array_ID", "Sample_Group",
    "Sample_Well", "Sample_Name", "Sample_ID")
)

for (col in extra_candidates) {
  v <- samples[[col]]
  if (length(unique(v[!is.na(v)])) >= 2) {
    tech_vars[[col]] <- as.integer(factor(v))
  }
}

#' ── Kruskal-Wallis p-Werte berechnen ─────────────────────────────────────────
#'
#' Testet Assoziation zwischen PCs und technischen Variablen.
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
#'
#' Definiert Schwellenwerte für p-Wert-basierte Heatmap-Darstellung.
thresholds <- c(1e-10, 1e-5, 0.01, 0.05, 1.01)

colors <- c(
  "#c0392b",  # sehr signifikant
  "#e67e22",
  "#f39c12",
  "#f4c2c2",
  "#f8f8f8"   # nicht signifikant
)

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
plot_path <- file.path(job_dir, "svd_plot.png")

n_vars <- nrow(pval_mat)
n_pcs_plot <- n_pcs

img_w <- max(900,  120 * n_pcs_plot + 300)
img_h <- max(600,  120 * n_vars + 300)

png(plot_path, width = img_w, height = img_h, res = 150)
on.exit(dev.off(), add = TRUE)

par(
  mar = c(6, 9, 5, 12),
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
  }
}

pc_labels <- paste0("PC-", seq_len(n_pcs_plot), "\n(", var_explained, "%)")

axis(
  side = 1,
  at = seq_len(n_pcs_plot),
  labels = pc_labels,
  las = 1,
  tick = FALSE,
  cex.axis = 0.85,
  line = 0.5
)

axis(
  side = 2,
  at = seq_len(n_vars),
  labels = rownames(pval_mat),
  las = 2,
  tick = FALSE,
  cex.axis = 0.9,
  line = 0.5
)

mtext(
  "Singular Value Decomposition Analysis (SVD)",
  side = 3,
  line = 2,
  cex = 1.2,
  font = 2
)

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

log_msg("done", "SVD association plot complete", "svd")
quit(save = "no", status = 0)