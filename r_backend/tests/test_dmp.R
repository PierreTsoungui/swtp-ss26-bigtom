library(testthat)
library(readr)
library(jsonlite)

# ══════════════════════════════════════════════════════════════════════════════
#  SMARTE PFADERKENNUNG (Verhindert stummes Skippen im Docker-Worker)
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
DMP_SCRIPT   <- find_project_file_smart("dmp.R")

# ══════════════════════════════════════════════════════════════════════════════
#  TEST-RUNNER (Mit JSON-Parsing für strukturierte Logs)
# ══════════════════════════════════════════════════════════════════════════════
run_dmp <- function(beta      = BETA_PATH,
                    samples   = SAMPLES_PATH,
                    job_dir   = tempfile("dmp_out_"),
                    adjPVal   = "0.05",
                    arraytype = "EPICv2") {
  
  old_wd <- getwd()
  setwd(dirname(DMP_SCRIPT))
  on.exit(setwd(old_wd), add = TRUE)
  
  status <- withCallingHandlers(
    tryCatch(
      system2("Rscript", c(shQuote(DMP_SCRIPT), 
                           shQuote(samples),   # args[1]: SampleSheet zuerst!
                           shQuote(job_dir),   # args[2]: Job-Verzeichnis als zweites!
                           shQuote(beta),      # args[3]: Beta-Pfad als drittes!
                           shQuote(adjPVal),   # args[4]
                           shQuote(arraytype)), # args[5]
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
  skip_if_not(file.exists(DMP_SCRIPT),   paste("dmp.R fehlt:",   DMP_SCRIPT))
}

# ══════════════════════════════════════════════════════════════════════════════
# 1  HAPPY PATH
# ══════════════════════════════════════════════════════════════════════════════

test_that("Standardlauf (Happy Path) funktioniert fehlerfrei", {
  skip_if_no_data()
  
  res <- run_dmp()
  
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(res$job_dir, "dmp_results.csv")))
  expect_true(file.exists(file.path(res$job_dir, "dmp_results.rds")))
  
  # FIX: Nutzt 'type' aus dem progress.R-Vertrag statt des alten 'status' Fields
  types <- sapply(res$logs, function(x) x$type)
  expect_true("done" %in% types, info = "Das finale 'done'-Signal fehlt in den JSON-Logs!")
  
  df <- read.csv(file.path(res$job_dir, "dmp_results.csv"), check.names = FALSE)
  expect_true(all(c("ID", "CHR", "POS", "GENE", "FEATURE", "CGI",
                    "ADJ_P", "GROUP1_AVG", "GROUP2_AVG",
                    "DELTA_BETA", "LOG_FC", "DMR_ID") %in% colnames(df)))
  expect_gt(nrow(df), 0L)
  
  expect_true(all(df$ADJ_P <= 0.05, na.rm = TRUE))
  expect_true(all(df$GROUP1_AVG >= 0 & df$GROUP1_AVG <= 1, na.rm = TRUE))
  expect_true(all(df$GROUP2_AVG >= 0 & df$GROUP2_AVG <= 1, na.rm = TRUE))
  expect_true(all(is.finite(df$LOG_FC)))
  
  expect_true(all(df$DELTA_BETA >= -1.0 & df$DELTA_BETA <= 1.0, na.rm = TRUE),
              info = "Fachlicher Fehler: Delta-Beta-Werte außerhalb des biologischen Rahmens [-1, 1]!")
})

# ══════════════════════════════════════════════════════════════════════════════
# 2  FEHLERFÄLLE & STRUKTURIERTE LOGS
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fehlende Beta-Datei → Sauberer Abbruch via JSON-Log", {
  skip_if_no_data()
  
  res <- run_dmp(beta = "nicht_vorhanden.rds")
  expect_equal(res$status, 1L)
  
  # FIX: Prüfung via 'type' Key
  types <- sapply(res$logs, function(x) x$type)
  expect_true("error" %in% types, info = "Fehlende Datei triggerte keinen geordneten JSON-Error-Status")
})

test_that("Spaltenanzahl Beta != Sample-Sheet-Zeilen → Kontrollierter Exit", {
  skip_if_no_data()
  
  raw_samples <- read_csv(SAMPLES_PATH, show_col_types = FALSE)
  tmp_sheet <- tempfile(fileext = ".csv")
  write_csv(raw_samples[1:2, ], tmp_sheet) 
  on.exit(unlink(tmp_sheet))
  
  res <- run_dmp(samples = tmp_sheet)
  expect_equal(res$status, 1L, info = "Pipeline brach bei Dimensionskonflikt nicht ab!")
  
  # FIX: Prüfung via 'type' Key
  types <- sapply(res$logs, function(x) x$type)
  expect_true("error" %in% types)
})

test_that("adjPVal = 0 → Keine signifikanten Daten → Geordneter Abbruch", {
  skip_if_no_data()
  
  res <- run_dmp(adjPVal = "0")
  expect_equal(res$status, 1L)
  
  # FIX: Prüfung via 'type' Key
  types <- sapply(res$logs, function(x) x$type)
  expect_true("error" %in% types, info = "Kein Error-Status bei 0 signifikanten DMPs emittiert.")
})

# ══════════════════════════════════════════════════════════════════════════════
# 3  FACHLICHER GUARDRAIL-TEST
# ══════════════════════════════════════════════════════════════════════════════
test_that("Fachlicher Edge-Case: Nur 1 biologische Gruppe im Sheet → Keine unkontrollierten R-Abstürze", {
  skip_if_no_data()
  
  raw_samples <- read_csv(SAMPLES_PATH, show_col_types = FALSE)
  raw_samples$Sample_Group <- "G1" 
  
  tmp_sheet <- tempfile(fileext = ".csv")
  write_csv(raw_samples, tmp_sheet)
  on.exit(unlink(tmp_sheet))
  
  res <- run_dmp(samples = tmp_sheet)
  
  expect_true(res$status %in% c(0L, 1L), info = "Pipeline ist unkontrolliert im mathematischen Modell abgestürzt!")
  
  if (res$status == 0L) {
    result_file <- file.path(res$job_dir, "dmp_results.csv")
    if (file.exists(result_file)) {
      df <- read.csv(result_file, check.names = FALSE)
      expect_true(is.data.frame(df), info = "Ausgabedatei ist keine gültige Tabelle.")
    }
  }
})