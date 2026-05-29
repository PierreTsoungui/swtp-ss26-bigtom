#' ── Pakete ────────────────────────────────────────────────────────────────────
#'
#' Lädt benötigte Test- und I/O-Pakete für die Validierung der Pipeline.
suppressPackageStartupMessages({
  library(testthat)
  library(readr)
})

#' ── Hilfsfunktionen (gespiegelt aus batch_svd.R) ──────────────────────────────
#'
#' Diese Funktionen sind bewusst identisch zur Produktionspipeline gehalten,
#' um Test- und Laufzeitverhalten konsistent zu validieren.

#' Normalisiert Sample-IDs für zuverlässigen String-Vergleich.
#'
#' Entfernt Whitespace, Tabs und Zeilenumbrüche zur robusten ID-Matching-Logik.
#'
#' @param x Zeichenvektor mit rohen IDs
#' @return bereinigter Character-Vektor
normalize_id <- function(x) {
  x <- as.character(x)
  x <- trimws(x)
  x <- gsub("[[:space:]]+", "", x)
  x <- gsub("\r|\n|\t", "", x)
  x
}

#' Liest ein Illumina Sample Sheet robust ein.
#'
#' Erkennt automatisch den [Data]-Block und überspringt Header-Informationen.
#'
#' @param path Pfad zur Sample-Sheet CSV-Datei
#' @return tibble mit Sample-Metadaten
read_sample_sheet_smart <- function(path) {
  lines <- readLines(path, warn = FALSE)
  
  # Illumina-Konvention: [Data] markiert den Start der Tabelle
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0
  
  read_csv(path, skip = skip_n, show_col_types = FALSE)
}

#' ── Testpfade ─────────────────────────────────────────────────────────────────
#'
#' Definiert Eingabe- und Ausgabepfade für die Testausführung.
project_root <- getwd()

beta_path    <- file.path(project_root, "filtered_data.rds")
sample_sheet <- file.path(project_root, "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv")
job_dir      <- file.path(project_root, "test_output")

dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)

#' ── Tests: Dateiexistenz ─────────────────────────────────────────────────────
#'
#' Prüft, ob alle benötigten Eingabedateien vorhanden sind.
test_that("input files exist", {
  expect_true(
    file.exists(beta_path),
    info = paste("Beta RDS not found at:", beta_path)
  )
  
  expect_true(
    file.exists(sample_sheet),
    info = paste("Sample sheet not found at:", sample_sheet)
  )
})

#' ── Tests: Sample Sheet Struktur ─────────────────────────────────────────────
#'
#' Validiert, ob alle für die Pipeline notwendigen Spalten vorhanden sind.
test_that("sample sheet has required columns", {
  skip_if(!file.exists(sample_sheet))
  
  samples <- read_sample_sheet_smart(sample_sheet)
  
  expect_true("Sentrix_ID" %in% colnames(samples))
  expect_true("Sentrix_Position" %in% colnames(samples))
  expect_true("Sample_Group" %in% colnames(samples))
})

#' ── Tests: Beta-Matrix Validität ──────────────────────────────────────────────
#'
#' Prüft Struktur und Wertebereich der Beta-Matrix.
#' Biologisch gültige Beta-Werte müssen im Bereich [0, 1] liegen.
test_that("beta matrix is valid", {
  skip_if(!file.exists(beta_path))
  
  beta <- as.matrix(readRDS(beta_path))
  
  expect_true(is.matrix(beta))
  expect_true(nrow(beta) > 0)
  expect_true(ncol(beta) > 0)
  
  expect_true(all(beta >= 0 & beta <= 1, na.rm = TRUE))
})

#' ── Tests: Sample Alignment ──────────────────────────────────────────────────
#'
#' Prüft, ob Beta-Matrix und Sample Sheet genügend gemeinsame Samples besitzen.
#' Dies ist kritisch für die nachfolgende PCA/SVD-Analyse.
test_that("sample alignment works", {
  skip_if(!file.exists(beta_path) || !file.exists(sample_sheet))
  
  beta    <- as.matrix(readRDS(beta_path))
  samples <- read_sample_sheet_smart(sample_sheet)
  
  samples$Array_ID <- paste0(
    samples$Sentrix_ID,
    "_",
    samples$Sentrix_Position
  )
  
  beta_ids   <- normalize_id(colnames(beta))
  sample_ids <- normalize_id(samples$Array_ID)
  
  common <- intersect(beta_ids, sample_ids)
  
  cat("beta samples:   ", length(beta_ids), "\n")
  cat("sheet samples:  ", length(sample_ids), "\n")
  cat("common samples: ", length(common), "\n")
  
  expect_true(
    length(common) >= 2,
    info = "Need at least 2 matching IDs between beta matrix and sample sheet"
  )
})

#' ── Tests: Pipeline Execution ────────────────────────────────────────────────
#'
#' Führt die vollständige SVD-Pipeline als Integrationstest aus.
#' Erwartet Exit-Code 0 und erzeugten Plot.
test_that("pipeline runs and produces SVD plot", {
  skip_if(!file.exists(beta_path) || !file.exists(sample_sheet))
  
  exit_code <- system(paste(
    "Rscript batch_svd.R",
    shQuote(beta_path),
    shQuote(sample_sheet),
    shQuote(job_dir)
  ))
  
  expect_equal(
    exit_code,
    0,
    info = "batch_svd.R exited with non-zero status"
  )
  
  expect_true(
    file.exists(file.path(job_dir, "svd_plot.png"))
  )
})

#' ── Tests: Output Validität ─────────────────────────────────────────────────
#'
#' Prüft, ob der erzeugte Plot plausibel groß ist (kein leerer Output).
test_that("SVD plot file is plausible", {
  plot_file <- file.path(job_dir, "svd_plot.png")
  
  skip_if(!file.exists(plot_file))
  
  expect_true(file.size(plot_file) > 1000)
})
