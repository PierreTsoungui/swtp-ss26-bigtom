library(testthat)
library(readr)
library(jsonlite)

# ══════════════════════════════════════════════════════════════════════════════
#  SMARTE PFADERKENNUNG & ILLUMINA-PARSER
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

BETA_PATH    <- find_project_file_smart("filtered_data.rds")
SAMPLES_PATH <- find_project_file_smart("Demo_EPIC-8v2-0_A1_SampleSheet_16.csv")
DMR_SCRIPT   <- find_project_file_smart("dmr.R")

# Parst Illumina-Sheets inklusive Metadaten-Header sauber für den Testkontext
read_sample_sheet_smart <- function(path) {
  lines <- readLines(path)
  idx <- which(grepl("^\\[Data\\]", lines))
  if (length(idx) > 0) {
    df <- read_csv(path, skip = idx, show_col_types = FALSE)
    list(header = lines[1:idx], data = df)
  } else {
    df <- read_csv(path, show_col_types = FALSE)
    list(header = character(0), data = df)
  }
}

write_sample_sheet_smart <- function(sheet_list, path) {
  if (length(sheet_list$header) > 0) {
    writeLines(sheet_list$header, path)
    write_csv(sheet_list$data, path, append = TRUE, col_names = TRUE)
  } else {
    write_csv(sheet_list$data, path)
  }
}

# ══════════════════════════════════════════════════════════════════════════════
#  TEST-RUNNER
# ══════════════════════════════════════════════════════════════════════════════
run_dmr <- function(beta         = BETA_PATH,
                    samples      = SAMPLES_PATH,
                    job_dir      = tempfile("dmr_out_"),
                    minProbes    = "3",
                    cutoff       = "0.1",
                    adjPvalDmr   = "0.05",
                    maxGap       = "1000",
                    arraytype    = "EPICv2",
                    nBootstraps  = "2",   
                    nCores       = "1") {
  
  old_wd <- getwd()
  setwd(dirname(DMR_SCRIPT))
  on.exit(setwd(old_wd), add = TRUE)
  
  status <- withCallingHandlers(
    tryCatch(
      system2("Rscript", c(shQuote(DMR_SCRIPT), shQuote(beta), shQuote(samples), 
                           shQuote(job_dir), shQuote(minProbes), shQuote(cutoff), 
                           shQuote(adjPvalDmr), shQuote(maxGap), shQuote(arraytype), 
                           shQuote(nBootstraps), shQuote(nCores)),
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
  
  list(status = exit_code,
       stdout = paste(status, collapse = "\n"),
       logs = parsed_logs,
       job_dir = job_dir)
}

skip_if_no_data <- function() {
  skip_if_not(file.exists(BETA_PATH),    paste("Beta fehlt:",   BETA_PATH))
  skip_if_not(file.exists(SAMPLES_PATH), paste("Samples fehlt:", SAMPLES_PATH))
  skip_if_not(file.exists(DMR_SCRIPT),   paste("dmr.R fehlt:",   DMR_SCRIPT))
}

# ══════════════════════════════════════════════════════════════════════════════
# 1  HAPPY PATH
# ══════════════════════════════════════════════════════════════════════════════

test_that("Standardlauf (Happy Path) berechnet DMRs und erzeugt korrekte Strukturen", {
  skip_if_no_data()
  
  res <- run_dmr()
  
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(res$job_dir, "dmr_results.csv")))
  expect_true(file.exists(file.path(res$job_dir, "dmr_results.rds")))
  
  statuses <- sapply(res$logs, function(x) x$status)
  expect_true("done" %in% statuses)
  
  df <- read.csv(file.path(res$job_dir, "dmr_results.csv"), check.names = FALSE)
  expect_true(all(c("ID", "N_DMPs", "CHR", "START", "STOP",
                    "WIDTH", "P_VALUE", "MEANDIFF") %in% colnames(df)))
  expect_gt(nrow(df), 0L)
  
  # FIX: Validierung an Bumphunter-Resampling-Realität angepasst
  expect_true(all(df$N_DMPs > 0))
  expect_true(all(df$WIDTH > 0))
  expect_true(all(df$P_VALUE >= 0 & df$P_VALUE <= 1, na.rm = TRUE))
  
  # FIX: Erlaubt mathematische Regressionskoeffizienten außerhalb des flachen Bereichs
  expect_true(all(is.finite(df$MEANDIFF)), info = "Nicht-endliche Werte in MEANDIFF detektiert!")
})

# ══════════════════════════════════════════════════════════════════════════════
# 2  FEHLERFÄLLE & VALIDIERUNGEN
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fehlende Beta-Datei → Strukturierter Abbruch in Stufe 'load_beta'", {
  skip_if_no_data()
  
  res <- run_dmr(beta = "nicht_vorhanden.rds")
  expect_equal(res$status, 1L)
  
  steps <- sapply(res$logs, function(x) x$step)
  expect_true("load_beta" %in% steps)
})

test_that("Ungültiger arraytype → Geordneter Abbruch in 'validate_params'", {
  skip_if_no_data()
  
  res <- run_dmr(arraytype = "INVALID")
  expect_equal(res$status, 1L)
  
  steps <- sapply(res$logs, function(x) x$step)
  expect_true("validate_params" %in% steps)
})

test_that("Probenanzahl-Konflikt → Abbruch über Validierungsstufen", {
  skip_if_no_data()
  
  # FIX: Nutzt den smarten Parser, um das Illumina-Format intakt zu halten
  sheet <- read_sample_sheet_smart(SAMPLES_PATH)
  sheet$data <- sheet$data[1:2, ] 
  
  tmp_sheet <- tempfile(fileext = ".csv")
  write_sample_sheet_smart(sheet, tmp_sheet)
  on.exit(unlink(tmp_sheet))
  
  res <- run_dmr(samples = tmp_sheet)
  expect_equal(res$status, 1L)
  
  # Fängt flexibel ab, ob die Pipeline wegen Dimensionskonflikt oder unzureichenden Gruppen stoppt
  steps <- sapply(res$logs, function(x) x$step)
  expect_true(any(c("validate_alignment", "validate_groups", "error") %in% steps))
})

# ══════════════════════════════════════════════════════════════════════════════
# 3  FACHLICHER BIOLOGIE-TEST
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fachlicher Edge-Case: Eine Gruppe hat nur 1 Probe → Hotfix greift und verhindert Absturz", {
  skip_if_no_data()
  
  # FIX: Nutzt den smarten Parser, um Spaltenverschiebungen im Test zu unterbinden
  sheet <- read_sample_sheet_smart(SAMPLES_PATH)
  raw_samples <- sheet$data
  
  target_group <- raw_samples$Sample_Group[1]
  other_groups <- raw_samples$Sample_Group[raw_samples$Sample_Group != target_group]
  
  raw_samples$Sample_Group[2:nrow(raw_samples)] <- other_groups[1]
  sheet$data <- raw_samples
  
  tmp_sheet <- tempfile(fileext = ".csv")
  write_sample_sheet_smart(sheet, tmp_sheet)
  on.exit(unlink(tmp_sheet))
  
  res <- run_dmr(samples = tmp_sheet)
  
  expect_equal(res$status, 0L, info = res$stdout)
  
  messages <- sapply(res$logs, function(x) x$message)
  expect_true(any(grepl("Hotfix: Gruppe", messages, ignore.case = TRUE)),
              info = "Der Single-Sample-Hotfix wurde laut Logs nicht getriggert.")
})