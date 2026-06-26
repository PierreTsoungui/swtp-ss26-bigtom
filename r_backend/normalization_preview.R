#!/usr/bin/env Rscript

# ------------------------------------------------------------
# NORMALIZATION PREVIEW
#
# AUFGABE:
#   - Gefiltertes RGChannelSet laden
#   - Mehrere Normalisierungsmethoden testen
#   - Density-Plots als PNG erzeugen (server-gerendert, nicht interaktiv)
#   - PCA-Punkte als JSON ausgeben (Sample, Gruppe, PC1/PC2) für den
#     interaktiven Frontend-Plotter (dynamische Farben, Label-Toggle, Export)
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
  library(jsonlite)
  library(BiocParallel)
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

# Lookup-Tabellen: Array_ID -> Sample_Name und Array_ID -> Sample_Group.
# Die Gruppe (Phänotyp) wird pro PCA-Punkt mitgegeben, damit das Frontend die
# Punkte dynamisch nach Gruppe einfärben kann (NRM-03).
sample_sheet$Array_ID <- paste0(sample_sheet$Sentrix_ID, "_", sample_sheet$Sentrix_Position)
id_to_name <- setNames(sample_sheet$Sample_Name, sample_sheet$Array_ID)
id_to_group <- if ("Sample_Group" %in% colnames(sample_sheet)) {
  setNames(as.character(sample_sheet$Sample_Group), sample_sheet$Array_ID)
} else {
  setNames(character(0), character(0))
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
  # Größer + höhere Auflösung als zuvor: Biolog:innen drucken/screenshotten die
  # Plots, daher müssen Achsen und Beschriftungen auch im Ausdruck lesbar sein
  # (NRM-02).
  png(
    filename,
    width = 1000,
    height = 650,
    res = 120,
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
    cex.main = 1.8,
    cex.lab  = 1.5,
    cex.axis = 1.3,
    lwd = 2.5
  )

  dev.off()
}

# ------------------------------------------------------------
# PCA -> JSON
# ------------------------------------------------------------
# Statt eines fertigen PNGs schreiben wir die PCA-Punktkoordinaten plus
# Metadaten (Sample-Name, Gruppe) als JSON. Das Frontend rendert daraus einen
# interaktiven Plot (dynamische Farben, Label-Toggle, PNG-Export) – siehe
# NRM-03/NRM-04. Density-Plots bleiben PNG, weil sie nicht interaktiv sind.

write_pca_json <- function(beta_values, filename, method_name,
                           sample_labels = NULL, sample_groups = NULL) {
  if (is.null(beta_values) || ncol(beta_values) < 3) {
    stop("PCA requires at least 3 samples")
  }

  beta_values[!is.finite(beta_values)] <- NA
  beta_values <- beta_values[complete.cases(beta_values), ]

  var_filter <- apply(beta_values, 1, var, na.rm = TRUE)
  beta_values <- beta_values[var_filter > 1e-6, ]

  if (nrow(beta_values) < 10) stop("Not enough valid CpGs remaining for PCA")
  if (ncol(beta_values) < 2)  stop("Not enough samples for PCA")

  if (nrow(beta_values) > MAX_PROBES_FOR_PCA) {
    set.seed(123)
    idx <- sample(seq_len(nrow(beta_values)), MAX_PROBES_FOR_PCA)
    beta_values <- beta_values[idx, ]
  }

  pca     <- prcomp(t(beta_values), center = TRUE, scale. = FALSE)
  var_exp <- round((pca$sdev^2 / sum(pca$sdev^2)) * 100, 1)

  n <- ncol(beta_values)

  # Sample-Labels: Parameter nutzen, sonst Spaltennamen, sonst generisch.
  # Spaltenreihenfolge bleibt durch das Zeilen-Filtering unverändert, daher
  # bleiben labels/groups korrekt an pca$x (Zeilen = Samples) ausgerichtet.
  labels_to_use <- if (!is.null(sample_labels) && length(sample_labels) == n) {
    sample_labels
  } else if (!is.null(colnames(beta_values))) {
    colnames(beta_values)
  } else {
    paste0("Sample_", seq_len(n))
  }

  groups_to_use <- if (!is.null(sample_groups) && length(sample_groups) == n) {
    as.character(sample_groups)
  } else {
    rep("", n)
  }
  groups_to_use[is.na(groups_to_use)] <- ""

  points <- lapply(seq_len(n), function(i) {
    list(
      sample = labels_to_use[i],
      group  = groups_to_use[i],
      pc1    = round(unname(pca$x[i, 1]), 4),
      pc2    = round(unname(pca$x[i, 2]), 4)
    )
  })

  payload <- list(
    method             = method_name,
    axes               = list(x = "PC1", y = "PC2"),
    variance_explained = list(pc1 = var_exp[1], pc2 = var_exp[2]),
    points             = points
  )

  jsonlite::write_json(payload, path = filename, auto_unbox = TRUE, pretty = TRUE)
}

# Schreibt eine PCA-JSON, die nur einen Fehler transportiert, damit das Frontend
# pro Methode eine klare Meldung anzeigen kann, statt eines leeren Plots.
write_pca_error_json <- function(filename, method_name, message) {
  jsonlite::write_json(
    list(method = method_name, error = message, points = list()),
    path = filename, auto_unbox = TRUE, pretty = TRUE
  )
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
    paste0("pca_", tolower(method_name), ".json")
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

    sample_groups <- ifelse(
      array_ids %in% names(id_to_group),
      id_to_group[array_ids],
      ""                                     # Fallback: keine Gruppe bekannt
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
      emit_progress(base_pct + 6, paste0(method_name, ": Generiere PCA-Daten (JSON)..."))
      write_pca_json(
        beta, pca_filename, method_name,
        sample_labels = sample_labels,
        sample_groups = sample_groups
      )
    }, error = function(e) {
      emit_progress(base_pct + 6, paste0("Hinweis: PCA fehlgeschlagen für ", method_name))
      write_pca_error_json(pca_filename, method_name, e$message)
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

    write_pca_error_json(
      pca_filename,
      method_name,
      paste("Normalization failed:", e$message)
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
    # preprocessSWAN randomly subsets probes — seed for a reproducible preview.
    set.seed(42)
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