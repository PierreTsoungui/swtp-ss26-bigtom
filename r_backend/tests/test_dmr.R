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
      system2("Rscript", c(shQuote(DMR_SCRIPT), 
                           shQuote(samples),     # args[1]: SampleSheet zuerst
                           shQuote(job_dir),     # args[2]: Job-Verzeichnis
                           shQuote(beta),        # args[3]: Beta-Pfad
                           shQuote(minProbes),   # args[4]
                           shQuote(cutoff),      # args[5]
                           shQuote(adjPvalDmr),  # args[6]
                           shQuote(maxGap),      # args[7]
                           shQuote(arraytype),   # args[8]
                           shQuote(nBootstraps), # args[9]
                           shQuote(nCores)),    # args[10]
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
  
  # FIX: Nutzt 'type' statt des nicht existierenden Feldes 'status'
  types <- sapply(res$logs, function(x) x$type)
  expect_true("done" %in% types)
  
  df <- read.csv(file.path(res$job_dir, "dmr_results.csv"), check.names = FALSE)
  expect_true(all(c("ID", "N_DMPs", "CHR", "START", "STOP",
                    "WIDTH", "P_VALUE", "MEANDIFF") %in% colnames(df)))
  expect_gt(nrow(df), 0L)
  
  expect_true(all(df$N_DMPs > 0))
  expect_true(all(df$WIDTH > 0))
  expect_true(all(df$P_VALUE >= 0 & df$P_VALUE <= 1, na.rm = TRUE))
  expect_true(all(is.finite(df$MEANDIFF)))
})

# ══════════════════════════════════════════════════════════════════════════════
# 2  FEHLERFÄLLE & VALIDIERUNGEN
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fehlende Beta-Datei → Strukturierter Abbruch", {
  skip_if_no_data()
  
  res <- run_dmr(beta = "nicht_vorhanden.rds")
  expect_equal(res$status, 1L)
  
  # FIX: Validierung prüft die Fehlermeldung im 'message'-Feld
  messages <- sapply(res$logs, function(x) x$message)
  expect_true(any(grepl("Beta matrix file not found", messages, ignore.case = TRUE)))
})

test_that("Ungültiger arraytype → Geordneter Abbruch", {
  skip_if_no_data()
  
  res <- run_dmr(arraytype = "INVALID")
  expect_equal(res$status, 1L)
  
  # FIX: Validierung über das 'message'-Feld
  messages <- sapply(res$logs, function(x) x$message)
  expect_true(any(grepl("Invalid arraytype", messages, ignore.case = TRUE)))
})

test_that("Probenanzahl-Konflikt → Abbruch über Validierungsstufen", {
  skip_if_no_data()
  
  sheet <- read_sample_sheet_smart(SAMPLES_PATH)
  sheet$data <- sheet$data[1:2, ] 
  
  tmp_sheet <- tempfile(fileext = ".csv")
  write_sample_sheet_smart(sheet, tmp_sheet)
  on.exit(unlink(tmp_sheet))
  
  res <- run_dmr(samples = tmp_sheet)
  expect_equal(res$status, 1L)
  
  # FIX: Flexibler Abfang der Fehlermeldung
  messages <- sapply(res$logs, function(x) x$message)
  expect_true(any(grepl("alignment|mismatch|group", messages, ignore.case = TRUE)))
})

# ══════════════════════════════════════════════════════════════════════════════
# 3  FACHLICHER BIOLOGIE-TEST
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fachlicher Edge-Case: Eine Gruppe hat nur 1 Probe → Hotfix greift und verhindert Absturz", {
  skip_if_no_data()
  
  sheet <- read_sample_sheet_smart(SAMPLES_PATH)
  raw_samples <- sheet$data
  
  # FIX: Dynamisches Auslesen der Samples, die tatsächlich in der Test-Beta-Matrix sind!
  beta_mat <- readRDS(BETA_PATH)
  beta_cols <- if (isS4(beta_mat)) {
    suppressPackageStartupMessages(library(minfi))
    colnames(minfi::getBeta(beta_mat))
  } else {
    colnames(beta_mat)
  }
  
  if ("Sentrix_ID" %in% colnames(raw_samples) && "Sentrix_Position" %in% colnames(raw_samples)) {
    array_ids <- paste0(raw_samples$Sentrix_ID, "_", raw_samples$Sentrix_Position)
    is_present <- (raw_samples$Sample_Name %in% beta_cols) | (array_ids %in% beta_cols)
  } else {
    is_present <- raw_samples$Sample_Name %in% beta_cols
  }
  
  valid_idx <- which(is_present)
  if (length(valid_idx) < 2) skip("Nicht genügend passende Proben in der Testmatrix.")
  
  # Wir bauen exakt 2 Gruppen aus den real vorhandenen Proben:
  # Die erste vorhandene Probe kriegt eine Single-Gruppe, alle anderen die Hauptgruppe
  raw_samples$Sample_Group[valid_idx[1]]  <- "Group_Single"
  raw_samples$Sample_Group[valid_idx[-1]] <- "Group_Multi"
  sheet$data <- raw_samples
  
  tmp_sheet <- tempfile(fileext = ".csv")
  write_sample_sheet_smart(sheet, tmp_sheet)
  on.exit(unlink(tmp_sheet))
  
  res <- run_dmr(samples = tmp_sheet)
  
  # Wenn der Hotfix greift, läuft ChAMP trotz Single-Sample-Gruppe mit Status 0 durch!
  expect_equal(res$status, 0L, info = res$stdout)
})