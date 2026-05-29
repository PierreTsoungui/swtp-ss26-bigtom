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

if (length(args) < 2) {

  stop(
    "Usage: Rscript normalization_preview.R <filtered_data.rds> <job_dir>"
  )
}

rds_path <- args[1]
job_dir  <- args[2]

if (!file.exists(rds_path)) {

  stop("ERROR: filtered_data.rds not found")
}

# ------------------------------------------------------------
# LOAD FILTERED RGChannelSet
# ------------------------------------------------------------

filtered_rgset <- readRDS(rds_path)

# ------------------------------------------------------------
# INFORMATIONEN
# ------------------------------------------------------------

n_samples <- ncol(filtered_rgset)
n_probes  <- nrow(filtered_rgset)

cat("=== NORMALIZATION PREVIEW ===\n")
cat("Samples:", n_samples, "\n")
cat("Probes :", n_probes, "\n")

flush.console()

# ------------------------------------------------------------
# EPICv2 MEMORY OPTIMIZATION
# ------------------------------------------------------------

MAX_PROBES_FOR_PCA <- 500000

# ------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------

emit_plot <- function(method, filename, plot_kind) {

  cat(
    toJSON(
      list(
        type       = "plot",
        method     = tolower(method),
        plot_kind  = plot_kind,
        file       = basename(filename)
      ),
      auto_unbox = TRUE
    ),
    "\n"
  )

  flush.console()
}

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

  cat("Saved density plot:", filename, "\n")

  flush.console()
}

# ------------------------------------------------------------
# PCA PLOT
# ------------------------------------------------------------

make_pca_plot <- function(
  beta_values,
  filename,
  title
) {

  if (is.null(beta_values) || ncol(beta_values) < 3) {

    stop(
      paste(
        "PCA plot requires at least 3 samples"
      )
    )
  }

  
# ----------------------------------------------------------
# CLEAN INVALID VALUES
# ----------------------------------------------------------

beta_values[!is.finite(beta_values)] <- NA

beta_values <- beta_values[
  complete.cases(beta_values),
]



var_filter <- apply(
  beta_values,
  1,
  var,
  na.rm = TRUE
)

beta_values <- beta_values[
  var_filter > 1e-6,
]



if (nrow(beta_values) < 10) {

  stop(
    "Not enough valid CpGs remaining for PCA"
  )
}
if (ncol(beta_values) < 2) {

  stop(
    "Not enough samples for PCA"
  )
}
  if (nrow(beta_values) > MAX_PROBES_FOR_PCA) {

    set.seed(123)

    idx <- sample(
      1:nrow(beta_values),
      MAX_PROBES_FOR_PCA
    )

    beta_values <- beta_values[idx, ]

    cat(
      "PCA downsampling:",
      nrow(beta_values),
      "probes\n"
    )

    flush.console()
  }

  pca <- prcomp(
    t(beta_values),

    center = TRUE,

    scale. = FALSE
  )

  

  var_exp <- round(
    (pca$sdev^2 / sum(pca$sdev^2)) * 100,
    1
  )


  sample_names <- colnames(beta_values)

  if (is.null(sample_names)) {

    sample_names <- paste0(
      "Sample_",
      1:ncol(beta_values)
    )
  }

  # ----------------------------------------------------------
  # DATAFRAME
  # ----------------------------------------------------------

  plot_data <- data.frame(

    PC1 = pca$x[, 1],

    PC2 = pca$x[, 2],

    Sample = sample_names
  )

  # ----------------------------------------------------------
  # PCA PLOT
  # ----------------------------------------------------------

  p <- ggplot(
    plot_data,
    aes(
      x = PC1,
      y = PC2,
      color = Sample
    )
  ) +

    geom_point(
      size = 3,
      alpha = 0.85
    ) +

    geom_text(
      aes(label = Sample),

      vjust = -0.8,

      size = 3,

      show.legend = FALSE
    ) +

    labs(

      title = paste(title, "- PCA Plot"),

      x = paste0(
        "PC1 (",
        var_exp[1],
        "%)"
      ),

      y = paste0(
        "PC2 (",
        var_exp[2],
        "%)"
      )
    ) +

    theme_minimal() +

    theme(

      plot.title = element_text(
        size = 14,
        face = "bold"
      ),

      axis.title = element_text(
        size = 12
      ),

      legend.position = "none"
    ) +

    scale_color_brewer(
      palette = "Set2"
    )

  ggsave(
    filename,

    plot = p,

    width = 8,

    height = 6,

    dpi = 150
  )

  cat("Saved PCA plot:", filename, "\n")

  flush.console()
}

# ------------------------------------------------------------
# RUN METHOD
# ------------------------------------------------------------
run_method <- function(
  method_name,
  normalization_expr
) {

  density_filename <- file.path(
    job_dir,
    paste0("density_", tolower(method_name), ".png")
  )

  pca_filename <- file.path(
    job_dir,
    paste0("pca_", tolower(method_name), ".png")
  )

  cat("Running:", method_name, "\n")
  flush.console()

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

    beta <- getBeta(normalized)

   

    tryCatch({

      make_density_plot(
        beta,
        density_filename,
        method_name
      )

    }, error = function(e) {

      cat("Density failed:", e$message, "\n")
      flush.console()

      create_error_png(
        density_filename,
        e$message,
        method_name,
        "density"
      )
    })

    emit_plot(
      method_name,
      density_filename,
      "density"
    )

   
   
    tryCatch({

      make_pca_plot(
        beta,
        pca_filename,
        method_name
      )

    }, error = function(e) {

      cat("PCA failed:", e$message, "\n")
      flush.console()

      create_error_png(
        pca_filename,
        e$message,
        method_name,
        "pca"
      )
    })

    emit_plot(
      method_name,
      pca_filename,
      "pca"
    )

   
    rm(normalized, beta)

  }, error = function(e) {

    cat("GLOBAL ERROR in", method_name, ":", e$message, "\n")
    flush.console()

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

    emit_plot(method_name, density_filename, "density")
    emit_plot(method_name, pca_filename, "pca")
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
  )
)

# ------------------------------------------------------------
# NOOB
# ------------------------------------------------------------

run_method(

  "NOOB",

  quote(
    preprocessNoob(filtered_rgset)
  )
)

# ------------------------------------------------------------
# QUANTILE
# ------------------------------------------------------------

run_method(

  "QUANTILE",

  quote(
    preprocessQuantile(filtered_rgset)
  )
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
  })
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
  })
)

# ------------------------------------------------------------
# DONE
# ------------------------------------------------------------

cat(
  "=== NORMALIZATION PREVIEW FINISHED ===\n"
)

flush.console()