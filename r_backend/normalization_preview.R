#!/usr/bin/env Rscript

# ------------------------------------------------------------
# NORMALIZATION PREVIEW
#
# AUFGABE:
#   - Gefiltertes RGChannelSet laden
#   - Mehrere Normalisierungsmethoden testen
#   - Density-Plots erzeugen
#   - PCA-Plots für Dimensionsreduktion erzeugen
#   - JSON-Metadaten ans Backend senden
#
# KUNDENANFORDERUNGEN:
# ------------------------------------------------------------
#
# 1. Density-Plots pro Methode
# 2. PCA-Scatterplots:
#      - jeder Sample = ein Punkt
#      - PC1 vs PC2
#      - Ausreißer sichtbar
#
# 3. Unterstützung für EPICv2
#
# 4. Keine automatische Empfehlung
#
# ------------------------------------------------------------

# ------------------------------------------------------------
# THREADING LIMITIEREN
# ------------------------------------------------------------

Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")
Sys.setenv(NUMEXPR_NUM_THREADS = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")

# ------------------------------------------------------------
# LIBRARIES
# ------------------------------------------------------------

suppressPackageStartupMessages({
  library(minfi)
  library(ggplot2)
  library(jsonlite)
  library(BiocParallel)
  library(RColorBrewer)
})

# ------------------------------------------------------------
# Progress Vertrag einbinden
# ------------------------------------------------------------
source("/app/r_backend/utils/progress.R")

# Gemäß Entwickler-Checkliste Punkt 2: Initialisierung melden
emit_progress(0, "Skript initialisiert - Starte Normalisierungsvorschau")

# ------------------------------------------------------------
# PARALLELVERARBEITUNG DEAKTIVIEREN
# ------------------------------------------------------------

BiocParallel::register(
  BiocParallel::SerialParam(),
  default = TRUE
)

options(mc.cores = 1)

register(SerialParam())

# ------------------------------------------------------------
# BLAS/OpenMP THREADS BEGRENZEN
# ------------------------------------------------------------

if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
}

# ------------------------------------------------------------
# INPUT CHECK
# ------------------------------------------------------------

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  emit_error("Usage: Rscript normalization_preview.R <filtered_data.rds> <job_dir> <sample_sheet.csv>")
}

rds_path          <- args[1]
job_dir           <- args[2]
sample_sheet_path <- args[3]

if (!file.exists(rds_path)) {
  emit_error("filtered_data.rds nicht gefunden")
}

# Sample Sheet einlesen - skippt [Header]-Block automatisch
read_sample_sheet <- function(path) {
  lines     <- readLines(path, warn = FALSE)
  data_start <- grep("^\\[Data\\]", lines)
  skip_n    <- if (length(data_start) > 0) data_start[1] else 0
  read.csv(path, skip = skip_n, stringsAsFactors = FALSE, check.names = FALSE)
}

sample_sheet <- read_sample_sheet(sample_sheet_path)

# Lookup-Tabelle: Array_ID -> Sample_Name
sample_sheet$Array_ID <- paste0(sample_sheet$Sentrix_ID, "_", sample_sheet$Sentrix_Position)
id_to_name <- setNames(sample_sheet$Sample_Name, sample_sheet$Array_ID)

# ------------------------------------------------------------
# LOAD FILTERED RGChannelSet
# ------------------------------------------------------------

filtered_rgset <- readRDS(rds_path)

# ------------------------------------------------------------
# INFORMATIONEN
# ------------------------------------------------------------

n_samples <- ncol(filtered_rgset)
n_probes  <- nrow(filtered_rgset)

emit_progress(5, paste0("Daten geladen - Samples: ", n_samples, ", Sonden: ", n_probes))

# ------------------------------------------------------------
# EPICv2 MEMORY OPTIMIZATION
# ------------------------------------------------------------

MAX_PROBES_FOR_PCA <- 500000

# ------------------------------------------------------------
# ERROR PNG
# ------------------------------------------------------------

create_error_png <- function(
  filename,
  message,
  method,
  plot_kind
) {
  png(
    filename,
    width = 800,
    height = 500,
    res = 96,
    type = "cairo"
  )

  plot.new()

  text(
    0.5,
    0.5,
    paste("ERROR:\n", message),
    cex = 1.3,
    col = "red"
  )

  dev.off()
}

# ------------------------------------------------------------
# DENSITY PLOT
# ------------------------------------------------------------

make_density_plot <- function(
  beta_values,
  filename,
  title
) {
  png(
    filename,
    width = 800,
    height = 500,
    res = 96,
    type = "cairo"
  )

  par(
    mar = c(5, 5, 4, 2)
  )

  densityPlot(
    beta_values,
    main = title,
    xlab = "Beta value",
    legend = FALSE,
    cex.main = 1.6,
    cex.lab  = 1.3,
    cex.axis = 1.2,
    lwd = 2
  )

  dev.off()
}

# ------------------------------------------------------------
# PCA PLOT
# ------------------------------------------------------------

make_pca_plot <- function(beta_values, filename, title, sample_labels = NULL) {
  if (is.null(beta_values) || ncol(beta_values) < 3) {
    stop("PCA plot requires at least 3 samples")
  }

  beta_values[!is.finite(beta_values)] <- NA
  beta_values <- beta_values[complete.cases(beta_values), ]

  var_filter <- apply(beta_values, 1, var, na.rm = TRUE)
  beta_values <- beta_values[var_filter > 1e-6, ]

  if (nrow(beta_values) < 10) stop("Not enough valid CpGs remaining for PCA")
  if (ncol(beta_values) < 2)  stop("Not enough samples for PCA")

  if (nrow(beta_values) > MAX_PROBES_FOR_PCA) {
    set.seed(123)
    idx <- sample(1:nrow(beta_values), MAX_PROBES_FOR_PCA)
    beta_values <- beta_values[idx, ]
  }

  pca <- prcomp(t(beta_values), center = TRUE, scale. = FALSE)

  var_exp <- round((pca$sdev^2 / sum(pca$sdev^2)) * 100, 1)

  # Sample-Labels: Parameter nutzen, sonst Spaltennamen, sonst generisch
  labels_to_use <- if (!is.null(sample_labels) && length(sample_labels) == ncol(beta_values)) {
    sample_labels
  } else {
    colnames(beta_values)
  }

  if (is.null(labels_to_use)) {
    labels_to_use <- paste0("Sample_", seq_len(ncol(beta_values)))
  }

  plot_data <- data.frame(
    PC1    = pca$x[, 1],
    PC2    = pca$x[, 2],
    Sample = labels_to_use
  )

  p <- ggplot(plot_data, aes(x = PC1, y = PC2, color = Sample)) +
    geom_point(size = 3, alpha = 0.85) +
    geom_text(
      aes(label = Sample),
      vjust    = -0.8,
      size     = 3,
      check_overlap = TRUE,
      show.legend = FALSE
    ) +
    labs(
      title = paste(title, "- PCA Plot"),
      x = paste0("PC1 (", var_exp[1], "%)"),
      y = paste0("PC2 (", var_exp[2], "%)")
    ) +
    theme_minimal() +
    theme(
      plot.title = element_text(size = 14, face = "bold"),
      axis.title = element_text(size = 12),
      legend.position = "none"
    ) +
    scale_color_brewer(palette = "Set2")

  ggsave(filename, plot = p, width = 8, height = 6, dpi = 150)
}

# ------------------------------------------------------------
# RUN METHOD
# ------------------------------------------------------------
run_method <- function(
  method_name,
  normalization_expr,
  base_pct
) {
  density_filename <- file.path(
    job_dir,
    paste0("density_", tolower(method_name), ".png")
  )

  pca_filename <- file.path(
    job_dir,
    paste0("pca_", tolower(method_name), ".png")
  )

  emit_progress(base_pct, paste0("Führe Vorschau-Methode aus: ", method_name))

  # ----------------------------------------------------------
  # INITIAL STATE
  # ----------------------------------------------------------

  normalized <- NULL
  beta <- NULL

  tryCatch({

    # ------------------------------------------------------
    # NORMALIZATION
    # ------------------------------------------------------

    normalized <- eval(normalization_expr)

    # ------------------------------------------------------
    # BETA EXTRACTION
    # ------------------------------------------------------

    beta <- as.matrix(getBeta(normalized))   # <-- as.matrix() hier!

    # Sample-Namen über Array_ID aus dem Sample Sheet nachschlagen
    array_ids <- colnames(beta)
    emit_progress(base_pct + 1, paste0("Array IDs: ", paste(array_ids, collapse=", ")))
    emit_progress(base_pct + 1, paste0("Lookup Namen: ", paste(id_to_name[array_ids], collapse=", ")))
    sample_labels <- ifelse(
      array_ids %in% names(id_to_name),
      id_to_name[array_ids],
      array_ids                              # Fallback: Array-ID wenn nicht gefunden
    )

    tryCatch({
      emit_progress(base_pct + 3, paste0(method_name, ": Generiere Density-Plot..."))
      make_density_plot(
        beta,
        density_filename,
        method_name
      )
    }, error = function(e) {
      emit_progress(base_pct + 3, paste0("Hinweis: Density-Plot fehlgeschlagen für ", method_name))
      create_error_png(
        density_filename,
        e$message,
        method_name,
        "density"
      )
    })

    tryCatch({
      emit_progress(base_pct + 6, paste0(method_name, ": Generiere PCA-Plot..."))
      make_pca_plot(beta, pca_filename, method_name, sample_labels = sample_labels)
    }, error = function(e) {
      emit_progress(base_pct + 6, paste0("Hinweis: PCA-Plot fehlgeschlagen für ", method_name))
      create_error_png(
        pca_filename,
        e$message,
        method_name,
        "pca"
      )
    })

    rm(normalized, beta)

  }, error = function(e) {
    emit_progress(base_pct + 8, paste0("Fehler in Methode ", method_name, ": ", e$message))

    create_error_png(
      density_filename,
      paste("Normalization failed:", e$message),
      method_name,
      "density"
    )

    create_error_png(
      pca_filename,
      paste("Normalization failed:", e$message),
      method_name,
      "pca"
    )
  })

  gc(verbose = FALSE, full = TRUE)
}

# ------------------------------------------------------------
# RAW
# ------------------------------------------------------------

run_method(
  "RAW",
  quote(
    preprocessRaw(filtered_rgset)
  ),
  base_pct = 10
)

# ------------------------------------------------------------
# NOOB
# ------------------------------------------------------------

run_method(
  "NOOB",
  quote(
    preprocessNoob(filtered_rgset)
  ),
  base_pct = 28
)

# ------------------------------------------------------------
# QUANTILE
# ------------------------------------------------------------

run_method(
  "QUANTILE",
  quote(
    preprocessQuantile(filtered_rgset)
  ),
  base_pct = 46
)

# ------------------------------------------------------------
# SWAN
# ------------------------------------------------------------

run_method(
  "SWAN",
  quote({
    mset_raw <- preprocessRaw(
      filtered_rgset
    )

    preprocessSWAN(
      filtered_rgset,
      mset_raw
    )
  }),
  base_pct = 64
)

# ------------------------------------------------------------
# FUNNORM
# ------------------------------------------------------------

run_method(
  "FUNNORM",
  quote({
    n_pcs <- min(
      2,
      max(
        1,
        ncol(filtered_rgset) - 1
      )
    )

    preprocessFunnorm(
      filtered_rgset,
      nPCs = n_pcs
    )
  }),
  base_pct = 82
)

# ------------------------------------------------------------
# DONE
# ------------------------------------------------------------

# Finale Erfolgsmeldung und anschließendes Done-Signal an das Backend senden
emit_progress(100, "Normalisierungsvorschau erfolgreich beendet")
emit_done()

quit(save = "no", status = 0)