#' Tests für batch_correct.R
#' Aufruf: Rscript test_batch_correct.R
library(testthat)
suppressPackageStartupMessages(library(limma))

# ── Stubs ZUERST ins Global Environment ──────────────────────────────────────
# Muss vor ALLEM anderen stehen – auch vor test_file() – weil test_file()
# das Skript in einer neuen Umgebung neu ausführt und dabei wieder hier
# oben beginnt. emit_* wird beim Sourcen von batch_correct.R sofort
# aufgerufen, daher müssen die Stubs zu diesem Zeitpunkt bereits existieren.
emit_progress <- function(pct, msg) invisible(NULL)
emit_done     <- function()         invisible(NULL)
emit_error    <- function(msg)      stop(msg, call. = FALSE)

# ── batch_correct.R laden (progress.R-Zeile + CLI-Block entfernen) ────────────
local({
  lines     <- readLines(path.expand("~/batch_correct.R"), warn = FALSE)
  lines     <- lines[!grepl("source\\(.*progress\\.R", lines)]
  cli_start <- grep("^is_main_script", lines)[1L]
  if (!is.na(cli_start)) lines <- lines[seq_len(cli_start - 1L)]
  tmp <- tempfile(fileext = ".R")
  writeLines(lines, tmp)
  source(tmp, local = FALSE)
})

# ── CLI-Einstiegspunkt: Rscript test_batch_correct.R ─────────────────────────
if (sys.nframe() == 0L) {
  this_file <- normalizePath(
    sub("--file=", "", grep("--file=", commandArgs(trailingOnly = FALSE), value = TRUE))
  )
  testthat::test_file(this_file)
}

# ── Hilfsfunktion: run_batch_correction mit tryCatch wrappen ─────────────────
run_correction <- function(job_dir, batch_vars, covariates = "") {
  tryCatch(
    {
      run_batch_correction(job_dir, batch_vars, covariates)
      list(success = TRUE, error = NULL)
    },
    error = function(e) list(success = FALSE, error = conditionMessage(e))
  )
}

# ── Hilfsfunktion: Job-Verzeichnis mit Illumina-konformem SampleSheet ─────────
#
# minfi::read.metharray.sheet() sucht nach "^[DATA]" (case-insensitive) und
# liest ab der nächsten Zeile. Es benennt automatisch um:
#   Sentrix_ID       → Slide
#   Sentrix_Position → Array
#
# Matrix-Spalten: "<Sentrix_ID>_<Sentrix_Position>" damit sync_samplesheet()
# die Zuordnung korrekt trifft.
#
# Sentrix-IDs als character statt integer (206891110001 überschreitet .Machine$integer.max)
make_job_dir <- function(batches2 = NULL) {
  tmp <- tempfile("job_")
  dir.create(tmp)
  set.seed(1)
  
  n   <- 8L
  ids <- as.character(206891110000 + seq_len(n))   # character, kein L-Suffix
  pos <- rep(c("R01C01", "R02C01", "R03C01", "R04C01"), 2L)
  
  mat <- matrix(
    runif(100L * n, 0.1, 0.9),
    nrow     = 100L,
    dimnames = list(
      paste0("cg", seq_len(100L)),
      paste0(ids, "_", pos)
    )
  )
  saveRDS(mat, file.path(tmp, "normalized_data.rds"))
  
  pd <- data.frame(
    Sample_Name      = paste0("S", seq_len(n)),
    Sample_Group     = rep(c("Case", "Ctrl"), each = 4L),
    Sentrix_ID       = ids,
    Sentrix_Position = pos,
    Batch            = rep(c("B1", "B2"), times = 4L),
    stringsAsFactors = FALSE
  )
  if (!is.null(batches2)) pd$Batch2 <- batches2
  
  ss_path <- file.path(tmp, "SampleSheet.csv")
  writeLines(c(
    "[Header],,,,",
    "Investigator Name,Test,,,,",
    ",,,,",
    "[Data],,,,"
  ), ss_path)
  suppressWarnings(
    write.table(pd, ss_path,
                sep = ",", row.names = FALSE, quote = FALSE, append = TRUE)
  )
  tmp
}

# ── Test 1: Eine Batch-Variable ───────────────────────────────────────────────
test_that("Korrektur mit einer Batch-Variable erzeugt corrected_data.rds", {
  job <- make_job_dir()
  res <- run_correction(job, "Batch", "Sample_Group")
  expect_true(res$success, info = res$error)
  expect_true(file.exists(file.path(job, "corrected_data.rds")))
})

# ── Test 2: Mehrere Batch-Variablen ──────────────────────────────────────────
test_that("Korrektur mit zwei Batch-Variablen erzeugt corrected_data.rds", {
  job <- make_job_dir(batches2 = rep(c("P", "Q"), times = 4L))
  res <- suppressWarnings(run_correction(job, "Batch,Batch2", "Sample_Group"))
  expect_true(res$success, info = res$error)
  expect_true(file.exists(file.path(job, "corrected_data.rds")))
})

# ── Test 3: Fehlerfälle ───────────────────────────────────────────────────────
test_that("Fehlende normalized_data.rds führt zu Fehler", {
  tmp <- tempfile()
  dir.create(tmp)
  ss_path <- file.path(tmp, "SampleSheet.csv")
  writeLines(c("[Header],,", ",,", "[Data],,"), ss_path)
  suppressWarnings(write.table(
    data.frame(Sample_Name = "S1", Sentrix_ID = "206891110001",
               Sentrix_Position = "R01C01", Batch = "B1"),
    ss_path, sep = ",", row.names = FALSE, quote = FALSE, append = TRUE
  ))
  expect_false(run_correction(tmp, "Batch")$success)
})

test_that("Fehlender SampleSheet führt zu Fehler", {
  tmp <- tempfile()
  dir.create(tmp)
  saveRDS(matrix(runif(50L), nrow = 10L), file.path(tmp, "normalized_data.rds"))
  expect_false(run_correction(tmp, "Batch")$success)
})
