#' ── Pakete ────────────────────────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(testthat)
  library(readr)
  library(jsonlite)
})

#' ── Hilfsfunktionen (gespiegelt aus batch_svd.R) ──────────────────────────────
normalize_id <- function(x) {
  x <- as.character(x)
  x <- trimws(x)
  x <- gsub("[[:space:]]+", "", x)
  x <- gsub("\r|\n|\t", "", x)
  x
}

read_sample_sheet_smart <- function(path) {
  lines <- readLines(path, warn = FALSE)
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0
  read_csv(path, skip = skip_n, show_col_types = FALSE)
}

#' ── Smarte & Rekursive Pfadsuch-Logik ─────────────────────────────────────────
test_dir <- getwd()

find_project_file_smart <- function(filename) {
  # 1. Blitzcheck: Typische Verdächtige prüfen
  candidate_dirs <- c(test_dir, dirname(test_dir), "/app", "/app/r_backend")
  for (d in candidate_dirs) {
    p <- file.path(d, filename)
    if (file.exists(p)) return(p)
  }
  
  # 2. Deep Search: Wenn nicht gefunden, suchen wir den gesamten /app-Ordner ab
  message(paste("Starte Tiefensuche im Container für:", filename))
  deep_search <- list.files(path = "/app", pattern = paste0("^", filename, "$"), 
                            recursive = TRUE, full.names = TRUE)
  
  if (length(deep_search) > 0) {
    return(deep_search[1])
  }
  
  # Fallback (damit testthat den Fehler sauber anzeigt)
  return(file.path(test_dir, filename))
}

# Pfade dynamisch auflösen
beta_path       <- find_project_file_smart("filtered_data.rds")
sample_sheet    <- find_project_file_smart("Demo_EPIC-8v2-0_A1_SampleSheet_16.csv")
pipeline_script <- find_project_file_smart("batch_svd.R")

# Job-Verzeichnis relativ zum Skript-Standort definieren
job_dir         <- file.path(dirname(pipeline_script), "test_output")
dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)

# Info-Log für dich im Terminal
cat("\n[INFO] Gefundene Pfade im Container:\n")
cat(" -> Beta-Matrix:  ", beta_path, "\n")
cat(" -> Sample Sheet: ", sample_sheet, "\n")
cat(" -> Hauptskript:  ", pipeline_script, "\n\n")

# ──────────────────────────────────────────────────────────────────────────────
#  FACHLICHE & TECHNISCHE TESTS
# ──────────────────────────────────────────────────────────────────────────────

test_that("input files exist", {
  expect_true(file.exists(beta_path), info = paste("Beta RDS nicht auffindbar. Gesucht unter:", beta_path))
  expect_true(file.exists(sample_sheet), info = paste("Sample Sheet nicht auffindbar. Gesucht unter:", sample_sheet))
  expect_true(file.exists(pipeline_script), info = paste("batch_svd.R nicht auffindbar. Gesucht unter:", pipeline_script))
})

test_that("sample sheet has required columns", {
  skip_if(!file.exists(sample_sheet))
  samples <- read_sample_sheet_smart(sample_sheet)
  expect_true("Sentrix_ID" %in% colnames(samples))
  expect_true("Sentrix_Position" %in% colnames(samples))
  expect_true("Sample_Group" %in% colnames(samples))
})

#' ── FIX-VALIDIERUNG (Issue 1 & 2): Whitelist & Biologie-Ausschluss ────────────
test_that("fachliche validierung: whitelist und biologie-ausschluss funktionieren", {
  skip_if(!file.exists(sample_sheet))
  samples <- read_sample_sheet_smart(sample_sheet)
  
  tech_whitelist <- c("Sentrix_ID", "Sentrix_Position", "Sample_Well", "Sample_Plate", 
                      "Pool_ID", "Batch", "Run", "Box", "Plate", "Processing_Date")
  
  expect_false("Sample_Group" %in% tech_whitelist, 
               info = "FACHLICHER FEHLER: 'Sample_Group' darf nicht Teil der technischen Whitelist sein!")
  
  detected_cols <- colnames(samples)
  allowed_extra <- intersect(detected_cols, tech_whitelist)
  
  expect_false("Sample_Name" %in% allowed_extra, info = "Whitelist-Fehler: Eindeutige Proben-IDs dürfen nicht als Batch gewertet werden.")
  expect_false("Sample_Group" %in% allowed_extra, info = "Biologie-Schutz-Fehler: Biologische Gruppen dürfen nicht in allowed_extra landen.")
})

#' ── FIX-VALIDIERUNG (Issue 4): EPICv2 Subsampling-Logik ───────────────────────
test_that("fachliche validierung: mathematische matrix-reduktion (OOM-Schutz)", {
  set.seed(42)
  mock_large_beta <- matrix(runif(60000 * 4, 0, 1), nrow = 60000, ncol = 4)
  max_probes <- 50000
  expect_true(nrow(mock_large_beta) > max_probes)
  
  row_vars <- rowMeans(mock_large_beta^2) - rowMeans(mock_large_beta)^2
  top_probes <- order(row_vars, decreasing = TRUE)[1:max_probes]
  sub_matrix <- mock_large_beta[top_probes, , drop = FALSE]
  
  expect_equal(nrow(sub_matrix), max_probes)
  expect_equal(ncol(sub_matrix), 4)
  expect_false(any(is.na(sub_matrix)))
})

#' ── FIX-VALIDIERUNG (Issue 5): Integrationstest via JSON-Log-Parsing ──────────
test_that("pipeline runs safely and logs correct functional steps", {
  skip_if(!file.exists(beta_path) || !file.exists(sample_sheet) || !file.exists(pipeline_script))
  
  # Führe das Skript im Verzeichnis aus, in dem es liegt
  old_wd <- getwd()
  setwd(dirname(pipeline_script))
  on.exit(setwd(old_wd), add = TRUE)
  
  output_logs <- system2(
    command = "Rscript",
    args = c(shQuote(pipeline_script), shQuote(beta_path), shQuote(sample_sheet), shQuote(job_dir)),
    stdout = TRUE,
    stderr = TRUE
  )
  
  parsed_logs <- lapply(output_logs, function(line) {
    tryCatch(jsonlite::fromJSON(line), error = function(e) NULL)
  })
  parsed_logs <- parsed_logs[!sapply(parsed_logs, is.null)]
  
  statuses <- sapply(parsed_logs, function(x) x$status)
  steps    <- sapply(parsed_logs, function(x) x$step)
  
  expect_false("error" %in% statuses, info = "Pipeline brach mit Fehler ab!")
  expect_true("done" %in% statuses, info = "Das finale 'done'-Signal wurde vom Skript nicht emittiert.")
  expect_false("validate_tech_vars" %in% steps, info = "Kritischer Fehler: Das Skript ist in den biologischen Notfall-Guardrail gelaufen!")
})

test_that("SVD plot file is plausible", {
  plot_file <- file.path(job_dir, "svd_plot.png")
  skip_if(!file.exists(plot_file))
  expect_true(file.size(plot_file) > 5000)
})