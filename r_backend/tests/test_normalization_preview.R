library(testthat)
library(readr)
library(jsonlite)

# ══════════════════════════════════════════════════════════════════════════════
#  SMARTE PFADERKENNUNG (Docker & Local-Dev kompatibel)
# ══════════════════════════════════════════════════════════════════════════════
test_dir <- getwd()

find_project_file_smart <- function(filename) {
  candidate_dirs <- c(test_dir, dirname(test_dir), "/app", "/app/r_backend")
  for (d in candidate_dirs) {
    p <- file.path(d, filename)
    if (file.exists(p)) return(p)
  }
  deep_search <- list.files(path = "/app", pattern = paste0("^", filename, "$"), 
                            recursive = TRUE, full.names = TRUE)
  if (length(deep_search) > 0) return(deep_search[1])
  return(file.path(test_dir, filename))
}

RDS_PATH     <- find_project_file_smart("filtered_data.rds")
#SAMPLES_PATH <- find_project_file_smart("Demo_EPIC-8v2-0_A1_SampleSheet_16.csv")
SAMPLES_PATH <- find_project_file_smart("Samplesheet.csv")
PREVIEW_SCR  <- find_project_file_smart("normalization_preview.R")

# ══════════════════════════════════════════════════════════════════════════════
#  TEST-RUNNER WRAPPER
# ══════════════════════════════════════════════════════════════════════════════
run_preview <- function(rds          = RDS_PATH,
                        samples      = SAMPLES_PATH,
                        job_dir      = tempfile("preview_out_")) {
  
  if (!dir.exists(job_dir)) dir.create(job_dir, recursive = TRUE)
  
  old_wd <- getwd()
  setwd(dirname(PREVIEW_SCR))
  on.exit(setwd(old_wd), add = TRUE)
  
  status <- withCallingHandlers(
    tryCatch(
      system2("Rscript", c(shQuote(PREVIEW_SCR), shQuote(rds), shQuote(job_dir), shQuote(samples)),
              stdout = TRUE, stderr = TRUE),
      error = function(e) NULL
    ),
    warning = function(w) invokeRestart("muffleWarning")
  )
  
  exit_code <- ifelse(is.null(attr(status, "status")), 0L, as.integer(attr(status, "status")))
  
  parsed_logs <- lapply(status, function(line) {
    tryCatch(jsonlite::fromJSON(line), error = function(e) NULL)
  })
  parsed_logs <- parsed_logs[!sapply(parsed_logs, is.null)]
  
  list(status  = exit_code,
       stdout  = paste(status, collapse = "\n"),
       logs    = parsed_logs,
       job_dir = job_dir)
}

skip_if_no_data <- function() {
  skip_if_not(file.exists(RDS_PATH),     paste("RDS fehlt:",     RDS_PATH))
  skip_if_not(file.exists(SAMPLES_PATH), paste("Samples fehlt:", SAMPLES_PATH))
  skip_if_not(file.exists(PREVIEW_SCR),  paste("Skript fehlt:",  PREVIEW_SCR))
}

# ══════════════════════════════════════════════════════════════════════════════
# 1  TECHNISCHE TESTING-EBENE
# ══════════════════════════════════════════════════════════════════════════════

test_that("Technische Validierung: Pipeline läuft durch und schreibt intakte Dateien", {
  skip_if_no_data()
  
  res <- run_preview()
  on.exit(unlink(res$job_dir, recursive = TRUE))
  
  expect_equal(res$status, 0L, info = res$stdout)
  
  # FIX: Resilienter Multi-Kriterien-Check für den Fortschritts-Vertrag
  progress_pcts <- sapply(res$logs, function(x) if(!is.null(x$progress)) x$progress else -1)
  steps         <- sapply(res$logs, function(x) if(!is.null(x$step)) x$step else "")
  statuses      <- sapply(res$logs, function(x) if(!is.null(x$status)) x$status else "")
  messages      <- sapply(res$logs, function(x) if(!is.null(x$message)) x$message else "")
  
  success_signaled <- (100 %in% progress_pcts) || 
                      ("done" %in% steps) || 
                      ("done" %in% statuses) || 
                      any(grepl("beendet", messages, ignore.case = TRUE))
  
  expect_true(success_signaled, info = "Das finale Abschluss-Signal (100%, 'done' oder Erfolgstext) fehlt in den JSON-Logs!")
  
  methods <- c("raw", "noob", "quantile", "swan", "funnorm")
  for (m in methods) {
    # Density bleibt ein server-gerendertes PNG; PCA wird als JSON für den
    # interaktiven Frontend-Plotter ausgegeben (NRM-03).
    density_file <- file.path(res$job_dir, paste0("density_", m, ".png"))
    pca_file     <- file.path(res$job_dir, paste0("pca_", m, ".json"))

    expect_true(file.exists(density_file))
    expect_true(file.exists(pca_file))

    expect_true(file.info(density_file)$size > 1000, info = paste("Density-Plot leer für:", m))

    pca <- jsonlite::fromJSON(pca_file, simplifyVector = FALSE)
    expect_true(!is.null(pca$points), info = paste("PCA-JSON ohne 'points' für:", m))
    expect_true(length(pca$points) >= 1L, info = paste("PCA-JSON ohne Punkte für:", m))
    # Jeder Punkt trägt Sample-Name, Gruppe und PC-Koordinaten.
    first <- pca$points[[1]]
    expect_true(all(c("sample", "group", "pc1", "pc2") %in% names(first)),
                info = paste("PCA-Punkt unvollständig für:", m))
  }
})

# ══════════════════════════════════════════════════════════════════════════════
# 2  FACHLICHE TESTING-EBENE (Kunden- & Biologie-Anforderungen)
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fachliche Validierung: Verwertung biologischer Gruppen und technischer Batches", {
  skip_if_no_data()
  
  lines <- readLines(SAMPLES_PATH, warn = FALSE)
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0
  sheet_content <- read.csv(SAMPLES_PATH, skip = skip_n, stringsAsFactors = FALSE, check.names = FALSE)
  
  expect_true("Sample_Group" %in% colnames(sheet_content), 
              info = "Fachlicher Fehler: Spalte 'Sample_Group' (Biologie) fehlt im Test-Datensatz!")
  expect_true("Sentrix_ID" %in% colnames(sheet_content), 
              info = "Fachlicher Fehler: Spalte 'Sentrix_ID' (Batch) fehlt im Test-Datensatz!")
  
  res <- run_preview()
  on.exit(unlink(res$job_dir, recursive = TRUE))
  
  messages <- unlist(sapply(res$logs, function(x) x$message))
  expect_true(any(grepl("Array IDs:", messages)), info = "Skript prozessiert keine Array-IDs für das Mapping.")
})
# Zusätzliche Tests 
test_that("Beschädigtes RDS wird erkannt", {

  skip_if_not(file.exists(SAMPLES_PATH))
  skip_if_not(file.exists(PREVIEW_SCR))

  broken_rds <- tempfile(fileext = ".rds")

  writeLines("kaputte datei", broken_rds)

  res <- run_preview(
    rds = broken_rds,
    samples = SAMPLES_PATH
  )
  cat("\n--- STDOUT ---\n")
  cat(res$stdout)
  cat("\n--- LOGS ---\n")
  print(res$logs)
  expect_true(res$status != 0)
})

test_that("Fehlendes filtered_data.rds wird erkannt", {

  skip_if_not(file.exists(SAMPLES_PATH))
  skip_if_not(file.exists(PREVIEW_SCR))

  res <- run_preview(
    rds = "/tmp/not_existing.rds",
    samples = SAMPLES_PATH
  )
  cat("\n--- STDOUT ---\n")
  cat(res$stdout)
  cat("\n--- LOGS ---\n")
  print(res$logs)
  expect_true(res$status != 0)
})