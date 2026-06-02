#!/usr/bin/env Rscript

#' US-32: Scatterplot Generation für Normalisierungsmethoden
#'
#' Erzeugt Scatterplots für 5 Normalisierungsmethoden:
#' RAW, NOOB, QUANTILE, FUNNORM, SWAN
#'
#' @section Design:
#' - Vollständig unabhängig von normalization_preview.R
#' - Keine Auswirkung auf die bestehende Pipeline
#' - Modular aufgebaut (sourcing-fähig für Tests)
#'
#' @section Verwendung (CLI):
#' \code{Rscript scatterplot_normalization.R <filtered_data.rds> <output_dir>}
#'
#' @section Output:
#' \itemize{
#'   \item \code{<output_dir>/scatter_raw.png}
#'   \item \code{<output_dir>/scatter_noob.png}
#'   \item \code{<output_dir>/scatter_quantile.png}
#'   \item \code{<output_dir>/scatter_swan.png}
#'   \item \code{<output_dir>/scatter_funnorm.png}
#' }

# ──────────────────────────────────────────────────────────
# Threading-Begrenzung (konsistent mit normalization_preview.R)
# ──────────────────────────────────────────────────────────

Sys.setenv(OMP_NUM_THREADS      = "1")
Sys.setenv(OPENBLAS_NUM_THREADS = "1")
Sys.setenv(MKL_NUM_THREADS      = "1")
Sys.setenv(NUMEXPR_NUM_THREADS  = "1")
Sys.setenv(VECLIB_MAXIMUM_THREADS = "1")

# ──────────────────────────────────────────────────────────
# Bibliotheken laden
# ──────────────────────────────────────────────────────────

suppressPackageStartupMessages({
  library(minfi)
  library(ggplot2)
  library(BiocParallel)
})

BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
options(mc.cores = 1)

if (requireNamespace("RhpcBLASctl", quietly = TRUE)) {
  RhpcBLASctl::blas_set_num_threads(1)
  RhpcBLASctl::omp_set_num_threads(1)
}

#' Normalisierungsmethode anwenden
#'
#' Wendet eine Normalisierungsmethode auf ein RGChannelSet an
#' und gibt die resultierende Beta-Matrix zurück.
#'
#' @param rgset Ein RGChannelSet-Objekt (geladen aus filtered_data.rds)
#' @param method Eine der unterstützten Normalisierungsmethoden:
#'   \code{c("RAW", "NOOB", "QUANTILE", "SWAN", "FUNNORM")}
#'
#' @return Beta-Matrix (CpGs x Samples) mit Werten im Bereich [0, 1]
#'
#' @details
#' - \strong{RAW}: Keine Normalisierung, nur Beta-Wert-Extraktion
#' - \strong{NOOB}: Noob-Normalisierung (Background-Korrektur)
#' - \strong{QUANTILE}: Quantile-Normalisierung mit Genome-Mapping
#' - \strong{SWAN}: Subset-Quantile Within Array Normalization
#'   (benötigt zusätzlich preprocessRaw()-Ergebnis)
#' - \strong{FUNNORM}: Functional Normalization (nPCs=2 für kleine Datensätze)
#'
#' @export
normalize_method <- function(rgset, method) {

  normalized <- switch(
    toupper(method),

    "RAW" = preprocessRaw(rgset),

    "NOOB" = preprocessNoob(rgset),

    "QUANTILE" = {
      BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
      preprocessQuantile(rgset)
    },

    "SWAN" = {
      # SWAN benötigt zusätzlich das preprocessRaw()-Ergebnis
      mset_raw <- preprocessRaw(rgset)
      preprocessSWAN(rgset, mset_raw)
    },

    "FUNNORM" = {
      BiocParallel::register(BiocParallel::SerialParam(), default = TRUE)
      # nPCs = 2 verhindert "initial centers are not distinct" bei kleinen Datensätzen
      preprocessFunnorm(rgset, nPCs = 2)
    },

    stop(paste("Unbekannte Methode:", method,
               "– Erlaubt: RAW, NOOB, QUANTILE, SWAN, FUNNORM"))
  )

  getBeta(normalized)
}

#' Scatterplot aus Beta-Matrix erzeugen
#'
#' Erzeugt einen Scatterplot (Sample 1 vs Sample 2) aus einer Beta-Matrix
#' und speichert ihn als PNG. Pearson-Korrelation wird berechnet und angezeigt.
#'
#' @param beta Eine Beta-Matrix oder Data Frame (CpGs x Samples)
#'   mit Werten im Bereich [0, 1]
#' @param output_path Dateipfad für PNG-Ausgabedatei
#' @param method Name der Normalisierungsmethode (für Plot-Titel)
#' @param n_cpgs Anzahl zufällig gesampelter CpGs für Visualisierung
#'   (default: 5000). Reduziert Overplotting und Renderzeit.
#'
#' @return Unsichtbar: Pfad zur erzeugten PNG-Datei
#'
#' @details
#' - Validiert Eingaben (Matrix/DataFrame, mindestens 2 Samples)
#' - Subsampled CpGs mit set.seed(42) für Reproduzierbarkeit
#' - Entfernt NA-Werte
#' - Berechnet Pearson-Korrelation
#' - Speichert als PNG (7x6 inch, 120 dpi, Cairo-Backend)
#'
#' @export
make_scatterplot <- function(beta, output_path, method, n_cpgs = 5000) {

  # ────────────────────────────────────────────────────────
  # Eingabe-Validierung
  # ────────────────────────────────────────────────────────

  if (!is.matrix(beta) && !is.data.frame(beta)) {
    stop("beta muss eine Matrix oder ein Data Frame sein")
  }

  if (ncol(beta) < 2) {
    stop(paste(
      "Mindestens 2 Samples erforderlich für Scatterplot –",
      "aktuell:", ncol(beta)
    ))
  }

  # ────────────────────────────────────────────────────────
  # CpG-Subsampling (zufälliger Subset)
  # Bessere Lesbarkeit und kürzere Renderzeit
  # ────────────────────────────────────────────────────────

  set.seed(42) # Reproduzierbarkeit
  idx <- sample(nrow(beta), min(n_cpgs, nrow(beta)))

  df <- data.frame(
    x = beta[idx, 1],
    y = beta[idx, 2]
  )

  # NA-Werte entfernen
  df <- df[complete.cases(df), ]

  if (nrow(df) == 0) {
    stop("Keine gültigen CpG-Werte nach NA-Filterung")
  }

  # ────────────────────────────────────────────────────────
  # Pearson-Korrelation berechnen
  # ────────────────────────────────────────────────────────

  r_val <- round(
    cor(df$x, df$y, use = "complete.obs"),
    digits = 3
  )

  sample_names <- colnames(beta)

  # ────────────────────────────────────────────────────────
  # ggplot Scatterplot erstellen
  # ────────────────────────────────────────────────────────

  p <- ggplot(df, aes(x = x, y = y)) +

    # Punkte (halbtransparent blau)
    geom_point(
      alpha = 0.35,
      size  = 0.9,
      color = "#2c7bb6"
    ) +

    # Diagonale (perfekte Korrelation als Referenzlinie)
    geom_abline(
      slope     = 1,
      intercept = 0,
      color     = "#d7191c",
      linetype  = "dashed",
      linewidth = 0.8
    ) +

    # Achsen auf Beta-Wertebereich [0, 1] begrenzen
    xlim(0, 1) +
    ylim(0, 1) +

    # Beschriftungen
    labs(
      title    = paste0("Normalization: ", toupper(method)),
      subtitle = paste0(
        "Pearson r = ", r_val,
        "  |  n = ", nrow(df), " CpGs (subsampled)"
      ),
      x = paste0("Beta  [", sample_names[1], "]"),
      y = paste0("Beta  [", sample_names[2], "]")
    ) +

    # Theme
    theme_bw(base_size = 13) +
    theme(
      plot.title    = element_text(face = "bold", size = 15),
      plot.subtitle = element_text(size = 10, color = "grey45"),
      axis.title    = element_text(size = 12),
      panel.grid.minor = element_blank()
    )

  # ────────────────────────────────────────────────────────
  # PNG speichern
  # ────────────────────────────────────────────────────────

  ggsave(
    output_path,
    plot   = p,
    width  = 7,
    height = 6,
    dpi    = 120
  )

  message("Saved: ", output_path)

  invisible(output_path)
}

#' Scatterplot für eine Normalisierungsmethode erzeugen
#'
#' Führt Normalisierung + Scatterplot-Erzeugung für eine einzelne Methode aus.
#' Fehler werden abgefangen und als Fehler-PNG gespeichert (kein Abbruch).
#'
#' @param rgset Ein RGChannelSet-Objekt
#' @param method Name der Normalisierungsmethode
#'   (einer von: RAW, NOOB, QUANTILE, SWAN, FUNNORM)
#' @param output_dir Ausgabeverzeichnis für PNG-Datei
#'
#' @return Unsichtbar: Pfad zur erzeugten PNG-Datei
#'
#' @details
#' - Fehlerbehandlung via tryCatch: Fehler unterbrechen Pipeline nicht
#' - Bei Fehler wird Fehler-PNG mit rotem Fehlertext erzeugt
#' - Speichert Ergebnis als \code{scatter_<method>.png}
#' - Gibt Garbage Collection aus nach Abschluss
#'
#' @export
run_scatterplot <- function(rgset, method, output_dir) {

  filename <- file.path(
    output_dir,
    paste0("scatter_", tolower(method), ".png")
  )

  message("--- Running scatterplot: ", method, " ---")

  tryCatch({

    beta <- normalize_method(rgset, method)
    make_scatterplot(beta, filename, method)

  }, error = function(e) {

    message("ERROR in ", method, ": ", e$message)

    # Fehler-PNG erzeugen (konsistent mit normalization_preview.R)
    png(filename, width = 600, height = 500, type = "cairo")
    plot.new()
    text(
      0.5, 0.5,
      paste0("ERROR (", method, "):\n", e$message),
      cex = 1.2,
      col = "red"
    )
    dev.off()
  })

  gc(verbose = FALSE, full = TRUE)

  invisible(filename)
}

#' Alle fünf Scatterplots erzeugen
#'
#' Hauptfunktion: Erzeugt Scatterplots für alle 5 Normalisierungsmethoden
#' (RAW, NOOB, QUANTILE, SWAN, FUNNORM).
#' Einstiegspunkt für Tests und CLI-Nutzung.
#'
#' @param rds_path Dateipfad zur filtered_data.rds (muss RGChannelSet enthalten)
#' @param output_dir Ausgabeverzeichnis für PNG-Dateien
#'   (wird erstellt, falls nicht vorhanden)
#'
#' @return Unsichtbar: NULL (Seiteneffekt: PNG-Dateien werden erzeugt)
#'
#' @details
#' - Validiert Input: \code{rds_path} muss existieren
#' - Erstellt \code{output_dir} rekursiv falls nötig
#' - Lädt RGChannelSet aus RDS-Datei
#' - Iteriert über 5 Normalisierungsmethoden
#' - Ruft \code{run_scatterplot()} für jede Methode auf
#' - Fehler in einer Methode unterbrechen nicht die gesamte Ausführung
#'
#' @export
run_all_scatterplots <- function(rds_path, output_dir) {

  # ────────────────────────────────────────────────────────
  # Eingabe-Validierung
  # ────────────────────────────────────────────────────────

  if (!file.exists(rds_path)) {
    stop("filtered_data.rds nicht gefunden: ", rds_path)
  }

  if (!dir.exists(output_dir)) {
    dir.create(output_dir, recursive = TRUE)
    message("Output-Verzeichnis erstellt: ", output_dir)
  }

  # ────────────────────────────────────────────────────────
  # Daten laden
  # ────────────────────────────────────────────────────────

  message("Lade RGChannelSet aus: ", rds_path)
  rgset <- readRDS(rds_path)

  # ────────────────────────────────────────────────────────
  # Alle 5 Normalisierungsmethoden ausführen
  # ────────────────────────────────────────────────────────

  methods <- c("RAW", "NOOB", "QUANTILE", "SWAN", "FUNNORM")

  for (method in methods) {
    run_scatterplot(rgset, method, output_dir)
  }

  message("=== SCATTERPLOT GENERATION FINISHED ===")
  message("Output: ", output_dir)
}

# ──────────────────────────────────────────────────────────
# CLI Einstiegspunkt
# Wird nur ausgeführt wenn Skript direkt aufgerufen wird
# (nicht bei source() in Tests)
# ──────────────────────────────────────────────────────────

if (!interactive()) {

  args <- commandArgs(trailingOnly = TRUE)

  if (length(args) < 2) {
    stop(paste(
      "Usage: Rscript scatterplot_normalization.R",
      "<filtered_data.rds> <output_dir>"
    ))
  }

  run_all_scatterplots(
    rds_path   = args[1],
    output_dir = args[2]
  )
}
