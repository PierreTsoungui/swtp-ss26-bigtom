#!/usr/bin/env Rscript

# =============================================================================
# NORMALIZATION PREVIEW
#
# DESCRIPTION:
#   - Loads filtered RGChannelSet
#   - Tests multiple normalization methods
#   - Generates density plots
#   - Generates PCA plots for dimensionality reduction
#   - Sends JSON metadata to backend
#
# CUSTOMER REQUIREMENTS:
#   1. Density plots per method
#   2. PCA scatterplots:
#      - Each sample = one point
#      - PC1 vs PC2
#      - Outliers visible
#   3. EPICv2 support
#   4. No automatic recommendation
# =============================================================================


# Thread Limiting (prevents pthread_create errors)

Sys.setenv(OMP_NUM_THREADS = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS = "1")
Sys.setenv(NUMEXPR_NUM_THREADS = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")


# Libraries

suppressPackageStartupMessages({
  library(minfi)
  library(ggplot2)
  library(jsonlite)
  library(BiocParallel)
  library(RColorBrewer)
})

# Progress Module

source("/app/r_backend/utils/progress.R")

# Parallel Processing Deactivation

BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
options(mc.cores = 1)

# BLAS/OpenMP Thread Limiting

if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
}

# Input Check

args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 3) {
  emit_error("Usage: Rscript normalization_preview.R <filtered_data.rds> <job_dir> <sample_sheet.csv>")
}

rds_path          <- args[1]
job_dir           <- args[2]
sample_sheet_path <- args[3]

# Load Filtered Data with Error Handling (Issue #1)

emit_progress(2, "Loading filtered data...")
# ─── Prüfe ob Datei existiert (BEVOR readRDS aufgerufen wird) 
if (!file.exists(rds_path)) {
  emit_error("The analysis data could not be found. Please ensure the previous filtering step completed successfully.")
}
filtered_rgset <- tryCatch(
  readRDS(rds_path),
  error = function(e) {
    emit_error("The analysis data could not be read. Please ensure the file is not damaged.")
  }
)

emit_progress(4, "Filtered data loaded successfully")

# Load Sample Sheet (with Error Handling)

emit_progress(5, "Loading sample sheet...")

read_sample_sheet <- function(path) {
  lines <- readLines(path, warn = FALSE)
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0
  
  tryCatch(
    read.csv(path, skip = skip_n, stringsAsFactors = FALSE, check.names = FALSE),
    error = function(e) {
       emit_error("The filtered data file could not be read. Please check that the file exists and is not corrupted.")
    }
  )
}

sample_sheet <- read_sample_sheet(sample_sheet_path)

# Create lookup table: Array_ID -> Sample_Name
sample_sheet$Array_ID <- paste0(sample_sheet$Sentrix_ID, "_", sample_sheet$Sentrix_Position)
id_to_name <- setNames(sample_sheet$Sample_Name, sample_sheet$Array_ID)


# Data Information

n_samples <- ncol(filtered_rgset)
n_probes  <- nrow(filtered_rgset)

emit_progress(6, paste0("Data loaded - Samples: ", n_samples, ", Probes: ", n_probes))

# EPICv2 Memory Optimization

MAX_PROBES_FOR_PCA <- 500000

# Error PNG (Helper Function)

#' Create error PNG for failed plots
#'
#' @param filename Output filename
#' @param message Error message
#' @param method Method name
#' @param plot_kind Plot type ("density" or "pca")
create_error_png <- function(filename, message, method, plot_kind) {
  png(filename, width = 800, height = 500, res = 96, type = "cairo")
  plot.new()
  text(0.5, 0.5, paste("ERROR:\n", message), cex = 1.3, col = "red")
  dev.off()
}


# Density Plot (Helper Function)

#' Create density plot from beta values
#'
#' @param beta_values Beta value matrix
#' @param filename Output filename
#' @param title Plot title
make_density_plot <- function(beta_values, filename, title) {
  png(filename, width = 800, height = 500, res = 96, type = "cairo")
  par(mar = c(5, 5, 4, 2))
  
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

# PCA Plot (Helper Function)

#' Create PCA scatterplot
#'
#' @param beta_values Beta value matrix
#' @param filename Output filename
#' @param title Plot title
#' @param sample_labels Optional sample labels for plotting
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
      vjust = -0.8,
      size = 3,
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


# Run Method (Main Execution Wrapper)

#' Run a single normalization method and generate plots
#'
#' @param method_name Name of the method
#' @param normalization_expr Expression to evaluate for normalization
#' @param base_pct Starting progress percentage
run_method <- function(method_name, normalization_expr, base_pct) {
  density_filename <- file.path(job_dir, paste0("density_", tolower(method_name), ".png"))
  pca_filename <- file.path(job_dir, paste0("pca_", tolower(method_name), ".png"))

  emit_progress(base_pct, paste0("Running preview for method: ", method_name))

  normalized <- NULL
  beta <- NULL

  tryCatch({
    # Normalization
    normalized <- eval(normalization_expr)
    
    # Beta extraction
    beta <- as.matrix(getBeta(normalized))

    # Sample name lookup
    array_ids <- colnames(beta)
    sample_labels <- ifelse(
      array_ids %in% names(id_to_name),
      id_to_name[array_ids],
      array_ids
    )

    # Density plot
    tryCatch({
      make_density_plot(beta, density_filename, method_name)
    }, error = function(e) {
      emit_progress(base_pct + 3, paste0("Density plot failed for ", method_name))
      create_error_png(density_filename, e$message, method_name, "density")
    })

    # PCA plot
    tryCatch({
      make_pca_plot(beta, pca_filename, method_name, sample_labels = sample_labels)
    }, error = function(e) {
      emit_progress(base_pct + 6, paste0("PCA plot failed for ", method_name))
      create_error_png(pca_filename, e$message, method_name, "pca")
    })

    rm(normalized, beta)

  }, error = function(e) {
    emit_progress(base_pct + 8, paste0("Error in method ", method_name, ": ", e$message))

    create_error_png(density_filename, paste("Normalization failed:", e$message), method_name, "density")
    create_error_png(pca_filename, paste("Normalization failed:", e$message), method_name, "pca")
  })

  gc(verbose = FALSE, full = TRUE)
}


# Execute All Normalization Methods


# 1. RAW
run_method("RAW", quote(preprocessRaw(filtered_rgset)), base_pct = 10)

# 2. NOOB
run_method("NOOB", quote(preprocessNoob(filtered_rgset)), base_pct = 28)

# 3. QUANTILE
run_method("QUANTILE", quote(preprocessQuantile(filtered_rgset)), base_pct = 46)

# 4. SWAN
run_method("SWAN", quote({
  mset_raw <- preprocessRaw(filtered_rgset)
  preprocessSWAN(filtered_rgset, mset_raw)
}), base_pct = 64)

# 5. FUNNORM
run_method("FUNNORM", quote({
  n_pcs <- min(2, max(1, ncol(filtered_rgset) - 1))
  preprocessFunnorm(filtered_rgset, nPCs = n_pcs)
}), base_pct = 82)


# Done

emit_progress(100, "Normalization preview completed successfully")
emit_done()

quit(save = "no", status = 0)