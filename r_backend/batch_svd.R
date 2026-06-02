# generate_svd_plot.R
args <- commandArgs(trailingOnly = TRUE)
n_args <- length(args)

# ── FLEXIBLER ARGUMENTEN-PARSER FÜR ALLE ROUTEN ─────────────────────────────
if (n_args >= 6) {
  # Fall A: Python-Wrapper hat Pfade injiziert (z.B. in der Batch-Init Phase)
  job_dir    <- args[1]   # /app/jobs/<job_id>/
  input_rds  <- args[4]   # normalized_data.rds oder corrected_data.rds
  output_png <- args[5]   # svd_plot_X.png
  batch_var  <- args[6]   # Variable oder "none"
} else if (n_args == 4) {
  # Fall B: Sauberer Aufruf mit genau 4 Argumenten (z.B. in der Korrektur-Phase)
  job_dir    <- args[1]   # /app/jobs/<job_id>
  input_rds  <- args[2]   # corrected_data.rds
  output_png <- args[3]   # svd_plot_2.png
  batch_var  <- args[4]   # Slide
} else {
  emit_error(paste('Unerwartete Anzahl an Argumenten:', n_args))
}
# ────────────────────────────────────────────────────────────────────────────

suppressPackageStartupMessages({
  library(minfi)
  library(ggplot2)
})

# Central progress contract
source("/app/r_backend/utils/progress.R")
emit_progress(0, "Start SVD-Plot-Generierung")

# 1. Daten laden
mat_path <- file.path(job_dir, input_rds)
if (!file.exists(mat_path)) {
  emit_error(paste("Input RDS-Datei nicht gefunden:", mat_path))
}
mat_data <- tryCatch(
  readRDS(mat_path),
  error = function(e) { emit_error(paste("Fehler beim Lesen der RDS-Datei:", conditionMessage(e))) }
)

# 2. In Matrix (Beta-Werte) umwandeln
if (is(mat_data, "RGChannelSet") || is(mat_data, "RGChannelSetExtended")) {
  mat_data <- preprocessRaw(mat_data)
}

if (is(mat_data, "MethylSet") || is(mat_data, "GenomicMethylSet") || 
    is(mat_data, "RatioSet") || is(mat_data, "GenomicRatioSet")) {
  mat <- getBeta(mat_data)
} else {
  mat <- as.matrix(mat_data)
}

mat <- na.omit(mat)
emit_progress(30, "Daten vorbereitet")

# 3. SampleSheet einlesen und an Matrix-IDs anpassen
targets <- read.metharray.sheet(job_dir, pattern = ".*SampleSheet.*\\.csv$")

targets_ids <- paste0(targets$Slide, "_", targets$Array)
clean_mat_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(colnames(mat)))
clean_targets_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(targets_ids))
matches <- match(clean_mat_ids, clean_targets_ids)

if (any(is.na(matches)) || length(matches) != ncol(mat)) {
  targets <- targets[1:ncol(mat), , drop=FALSE]
} else {
  targets <- targets[matches, , drop=FALSE]
}

# 4. PCA berechnen (Top 5000 variabelste Probes)
row_vars <- apply(mat, 1, var)
top_probes <- head(order(row_vars, decreasing = TRUE), 5000)

if(nrow(mat) < 5000) top_probes <- 1:nrow(mat)

pca <- tryCatch(
  prcomp(t(mat[top_probes, ]), scale. = TRUE),
  error = function(e) { emit_error(paste("PCA fehlgeschlagen:", conditionMessage(e))) }
)
emit_progress(70, "PCA berechnet")

# Base-Dataframe für ggplot bauen
pca_df <- data.frame(
  PC1 = pca$x[, 1],
  PC2 = pca$x[, 2]
)

# Abfangen von "none" oder ungültigen Spalten
if (is.null(batch_var) || batch_var == "none" || !(batch_var %in% colnames(targets))) {
  pca_df$Batch <- "All Samples"
  subtitle_text <- "Baseline: Uncorrected (No variable selected)"
} else {
  pca_df$Batch <- as.factor(targets[[batch_var]])
  subtitle_text <- paste("Colored by:", batch_var)
}

# 5. Plot generieren
p <- ggplot(pca_df, aes(x = PC1, y = PC2, color = Batch)) +
    geom_point(size = 3, alpha = 0.8) +
    theme_minimal() +
    labs(
      title = "SVD / PCA Plot",
      subtitle = subtitle_text,
      x = "Principal Component 1",
      y = "Principal Component 2"
    ) +
    theme(legend.position = "bottom")

# 6. Speichern und Erfolg an das Backend melden
tryCatch({
  ggsave(file.path(job_dir, output_png), plot = p, width = 7, height = 5, dpi = 150)
  emit_progress(90, "Plot gespeichert")

  # Emit standardized plot event for the backend to pick up
  emit_plot("svd", "svd", output_png)
  emit_progress(100, "Plot generiert")
  emit_done()
}, error = function(e) {
  emit_error(paste("Fehler beim Speichern des Plots:", conditionMessage(e)))
})
