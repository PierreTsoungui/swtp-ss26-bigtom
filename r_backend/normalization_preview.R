#!/usr/bin/env Rscript

# ------------------------------------------------------------
# NORMALIZATION PREVIEW
#
# AUFGABE:
#   - Gefiltertes RGChannelSet laden
#   - Mehrere Normalisierungsmethoden testen
#   - Density-Plots erzeugen
#   - JSON-Metadaten ans Backend senden
#
# WICHTIGE ÄNDERUNGEN:
# ------------------------------------------------------------
#
# 1. filtered_data.rds enthält jetzt ein RGChannelSet
#    statt einer Beta-Matrix
#
# 2. SWAN wurde korrigiert:
#    preprocessSWAN() braucht:
#       preprocessSWAN(rgSet, mSet)
#
# 3. FUNNORM robuster gemacht:
#    nPCs = 2 reduziert Fehler:
#       "initial centers are not distinct"
#
# 4. PNGs wurden VERGRÖSSERT
#
# 5. densityPlot() wurde verbessert:
#      - größere Schrift
#      - dickere Linien
#      - kleinere Ränder
#
# 6. Einheitliche run_method()-Funktion
#
# 7. RAW ist nur Referenzplot
#    (nicht auswählbar im Frontend)
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
})

BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
options(mc.cores = 1)

# ------------------------------------------------------------
# PARALLELVERARBEITUNG DEAKTIVIEREN
# ------------------------------------------------------------
register(SerialParam())


message("RhpcBLASctl available: ", requireNamespace("RhpcBLASctl", quietly = TRUE))
message("OMP_NUM_THREADS: ", Sys.getenv("OMP_NUM_THREADS"))
message("OPENBLAS_NUM_THREADS: ", Sys.getenv("OPENBLAS_NUM_THREADS"))

# ------------------------------------------------------------
# BLAS/OpenMP-Threads hart begrenzen
# (manche BLAS-Bibliotheken ignorieren Umgebungsvariablen)
# ------------------------------------------------------------
if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
  message("BLAS/OpenMP threads forced to 1")
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
#
# GEÄNDERT:
# ----------
# ALT:
#   Beta-Matrix geladen
#
# NEU:
#   RGChannelSet laden
#
# WARUM?
# -------
# preprocessNoob()
# preprocessQuantile()
# preprocessFunnorm()
# preprocessSWAN()
#
# brauchen ein RGChannelSet
# ------------------------------------------------------------

filtered_rgset <- readRDS(rds_path)

# ------------------------------------------------------------
# HELPERS
# ------------------------------------------------------------

emit_plot <- function(method, filename) {

  cat(
    toJSON(
      list(
        type   = "plot",
        method = tolower(method),
        file   = basename(filename)
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
#
# GEÄNDERT:
# ----------
# PNG deutlich größer gemacht
#
# ALT:
#   kleine PNGs
#
# NEU:
#   1400x800 + höhere Auflösung
# ------------------------------------------------------------

create_error_png <- function(filename, message, method) {

  png(
    filename,
    width = 800, # Vorher: 1400
    height = 500, # Vorher: 800
    res = 96, # Vorher: 150
    type = "cairo"
  )

  plot.new()

  text(
    0.5,
    0.5,
    paste("ERROR:\n", message),
    cex = 1.5
  )

  dev.off()

  emit_plot(method, filename)
}

# ------------------------------------------------------------
# DENSITY PLOT
# ------------------------------------------------------------
#
# GEÄNDERT:
# ----------
# ALT:
#   kleine schwer lesbare Plots
#
# NEU:
#   - größere PNGs
#   - größere Schrift
#   - dickere Linien
#   - kleinere Margins
#
# WARUM?
# -------
# densityPlot() aus minfi nutzt sonst
# nur einen kleinen Bereich des Bildes
# ------------------------------------------------------------

make_density_plot <- function(beta_values, filename, title) {

  png(
    filename,
    width = 800, # Vorher: 1600
    height = 500, # Vorher: 1000
    res = 96, # Vorher: 150
    type = "cairo" # Cairo-Rendering ohne X11-Interaktion
  )

  # --------------------------------------------------------
  # GEÄNDERT:
  # kleinere Ränder
  # --------------------------------------------------------

  par(
    mar = c(5, 5, 4, 2)
  )

  densityPlot(
    beta_values,

    main = title,

    xlab = "Beta value",

    # ------------------------------------------------------
    # GEÄNDERT:
    # größere Schrift
    # ------------------------------------------------------

    cex.main = 2,
    cex.lab  = 1.5,
    cex.axis = 1.3,

    # ------------------------------------------------------
    # GEÄNDERT:
    # dickere Linien
    # ------------------------------------------------------

    lwd = 2
  )

  dev.off()

  while(!is.null(dev.list())) {
    dev.off()
  }

  cat(
    "Saved:",
    filename,
    "\n"
  )

  flush.console()
}

# ------------------------------------------------------------
# RUN METHOD
# ------------------------------------------------------------
#
# GEÄNDERT:
# ----------
# Einheitliche Funktion für:
#   RAW
#   NOOB
#   QUANTILE
#   SWAN
#   FUNNORM
#
# Weniger duplizierter Code
# ------------------------------------------------------------

run_method <- function(method_name, normalization_expr) {

  filename <- file.path(
    job_dir,
    paste0(
      "norm_",
      tolower(method_name),
      ".png"
    )
  )

  cat(
    "Running:",
    method_name,
    "\n"
  )

  flush.console()

  tryCatch({

    # --------------------------------------------------------
    # NORMALIZATION
    # --------------------------------------------------------

    normalized <- eval(normalization_expr)

    # --------------------------------------------------------
    # BETA VALUES
    # --------------------------------------------------------

    beta <- getBeta(normalized)

    # --------------------------------------------------------
    # DENSITY PLOT
    # --------------------------------------------------------

    make_density_plot(
      beta,
      filename,
      method_name
    )

    # --------------------------------------------------------
    # SEND TO BACKEND
    # --------------------------------------------------------

    emit_plot(
      method_name,
      filename
    )

     rm(normalized, beta) # Speicher freigeben

  }, error = function(e) {

    cat(
      "ERROR in",
      method_name,
      ":",
      e$message,
      "\n"
    )

    flush.console()

    # --------------------------------------------------------
    # ERROR IMAGE
    # --------------------------------------------------------

    create_error_png(
      filename,
      e$message,
      method_name
    )
  })

  gc(verbose = FALSE, full = TRUE) # Freigabe von Speicher nach jeder Methode
}

# ------------------------------------------------------------
# RAW
# ------------------------------------------------------------
#
# GEÄNDERT:
# ----------
# RAW basiert jetzt auf preprocessRaw()
#
# WARUM?
# -------
# Vergleich mit normalisierten Daten
#
# WICHTIG:
# ----------
# RAW ist nur Referenz
# NICHT auswählbar im Frontend
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
#
# HINWEIS:
# ----------
# Kann bei kleinen Datensätzen
# fehlschlagen
# ------------------------------------------------------------

run_method(
  "QUANTILE",

  quote({
    BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
    preprocessQuantile(filtered_rgset)
  })
)

# ------------------------------------------------------------
# SWAN
# ------------------------------------------------------------
#
# GEÄNDERT:
# ----------
# ALT:
#   preprocessSWAN(filtered_rgset)
#
# FALSCH!
#
# NEU:
#   preprocessSWAN(rgSet, mSet)
#
# WARUM?
# -------
# SWAN benötigt:
#   1. RGChannelSet
#   2. preprocessRaw() Ergebnis
# ------------------------------------------------------------

run_method(
  "SWAN",

  quote({

    # ------------------------------------------------------
    # preprocessRaw() zuerst
    # ------------------------------------------------------

    mset_raw <- preprocessRaw(
      filtered_rgset
    )

    # ------------------------------------------------------
    # SWAN korrekt ausführen
    # ------------------------------------------------------

    preprocessSWAN(
      filtered_rgset,
      mset_raw
    )
  })
)

# ------------------------------------------------------------
# FUNNORM
# ------------------------------------------------------------
#
# GEÄNDERT:
# ----------
# nPCs = 2 hinzugefügt
#
# WARUM?
# -------
# reduziert Fehler:
#   "initial centers are not distinct"
#
# besonders bei kleinen Datensätzen
# ------------------------------------------------------------

run_method(
  "FUNNORM",

  quote({
    BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
    preprocessFunnorm(
      filtered_rgset,
      nPCs = 2
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