# ── test_dmp.R ────────────────────────────────────────────────────────────────
#
#  Voraussetzungen:
#    - filtered_data.rds
#    - Demo_EPIC-8v2-0_A1_SampleSheet_16.csv
#    - dmp.R
#
#  Ausführung:
#    Rscript -e "testthat::test_file('test_dmp.R')"
#
# ──────────────────────────────────────────────────────────────────────────────

library(testthat)

BETA_PATH    <- "filtered_data.rds"
SAMPLES_PATH <- "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"
DMP_SCRIPT   <- "dmp.R"

run_dmp <- function(beta      = BETA_PATH,
                    samples   = SAMPLES_PATH,
                    job_dir   = tempfile("dmp_out_"),
                    adjPVal   = "0.05",
                    arraytype = "EPICv2") {
  
  status <- withCallingHandlers(
    tryCatch(
      system2("Rscript", c(DMP_SCRIPT, beta, samples, job_dir, adjPVal, arraytype),
              stdout = TRUE, stderr = TRUE),
      error = function(e) NULL
    ),
    warning = function(w) invokeRestart("muffleWarning")
  )
  
  exit_code <- ifelse(is.null(attr(status, "status")), 0L,
                      as.integer(attr(status, "status")))
  
  list(status = exit_code,
       stdout = paste(status, collapse = "\n"),
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

test_that("Standardlauf endet mit Exit-Code 0 und erzeugt Ausgabedateien", {
  skip_if_no_data()
  
  res <- run_dmp()
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(res$job_dir, "dmp_results.csv")))
  expect_true(file.exists(file.path(res$job_dir, "dmp_results.rds")))
})


test_that("Ergebnis enthält Pflicht-Spalten und mindestens 1 DMP", {
  skip_if_no_data()
  
  res <- run_dmp()
  df  <- read.csv(file.path(res$job_dir, "dmp_results.csv"), check.names = FALSE)
  
  expect_true(all(c("ID", "CHR", "POS", "GENE", "FEATURE", "CGI",
                    "ADJ_P", "GROUP1_AVG", "GROUP2_AVG",
                    "DELTA_BETA", "LOG_FC", "DMR_ID") %in% colnames(df)))
  expect_gt(nrow(df), 0L)
})


test_that("ADJ_P <= 0.05, AVG-Werte in [0,1], LOG_FC endlich", {
  skip_if_no_data()
  
  df <- read.csv(file.path(run_dmp()$job_dir, "dmp_results.csv"),
                 check.names = FALSE)
  
  expect_true(all(df$ADJ_P <= 0.05, na.rm = TRUE))
  expect_true(all(df$GROUP1_AVG >= 0 & df$GROUP1_AVG <= 1, na.rm = TRUE))
  expect_true(all(df$GROUP2_AVG >= 0 & df$GROUP2_AVG <= 1, na.rm = TRUE))
  expect_true(all(is.finite(df$LOG_FC)))
})


# ══════════════════════════════════════════════════════════════════════════════
# 2  FEHLERFÄLLE
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fehlende Beta-Datei → Exit-Code 1 mit 'error'-Status", {
  skip_if_no_data()
  
  res <- run_dmp(beta = "nicht_vorhanden.rds")
  expect_equal(res$status, 1L)
  expect_true(grepl('"error"', res$stdout))
})


test_that("Spaltenanzahl Beta != Sample-Sheet-Zeilen → Exit-Code 1", {
  skip_if_no_data()
  
  tmp <- tempfile(fileext = ".rds")
  saveRDS(readRDS(BETA_PATH)[, 1:2, drop = FALSE], tmp)
  on.exit(unlink(tmp))
  
  expect_equal(run_dmp(beta = tmp)$status, 1L)
})


test_that("adjPVal = 0 → keine DMPs → Exit-Code 1", {
  skip_if_no_data()
  
  expect_equal(run_dmp(adjPVal = "0")$status, 1L)
})