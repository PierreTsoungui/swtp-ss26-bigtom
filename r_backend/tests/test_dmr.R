# ── test_dmr.R ────────────────────────────────────────────────────────────────
#
#  Voraussetzungen:
#    - filtered_data.rds
#    - Demo_EPIC-8v2-0_A1_SampleSheet_16.csv
#    - dmr.R
#
#  Ausführung:
#    Rscript -e "testthat::test_file('test_dmr.R')"
#
# ──────────────────────────────────────────────────────────────────────────────

library(testthat)

BETA_PATH    <- "filtered_data.rds"
SAMPLES_PATH <- "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"
DMR_SCRIPT   <- "dmr.R"

run_dmr <- function(beta      = BETA_PATH,
                    samples   = SAMPLES_PATH,
                    job_dir   = tempfile("dmr_out_"),
                    arraytype = "EPICv2") {
  
  status <- withCallingHandlers(
    tryCatch(
      system2("Rscript", c(DMR_SCRIPT, beta, samples, job_dir,
                           "3", "0.1", "0.05", "1000", arraytype, "50", "1"),
              stdout = TRUE, stderr = TRUE),
      error = function(e) NULL
    ),
    warning = function(w) invokeRestart("muffleWarning")
  )
  
  exit_code <- ifelse(is.null(attr(status, "status")), 0L,
                      as.integer(attr(status, "status")))
  
  list(status  = exit_code,
       stdout  = paste(status, collapse = "\n"),
       job_dir = job_dir)
}

skip_if_no_data <- function() {
  skip_if_not(file.exists(BETA_PATH),    paste("Beta fehlt:",    BETA_PATH))
  skip_if_not(file.exists(SAMPLES_PATH), paste("Samples fehlt:", SAMPLES_PATH))
  skip_if_not(file.exists(DMR_SCRIPT),   paste("dmr.R fehlt:",   DMR_SCRIPT))
}


# ══════════════════════════════════════════════════════════════════════════════
# 1  HAPPY PATH
# ══════════════════════════════════════════════════════════════════════════════

test_that("Standardlauf endet mit Exit-Code 0 und erzeugt Ausgabedateien", {
  skip_if_no_data()
  
  res <- run_dmr()
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(res$job_dir, "dmr_results.csv")))
  expect_true(file.exists(file.path(res$job_dir, "dmr_results.rds")))
})


test_that("Ergebnis enthält Pflicht-Spalten und mindestens 1 DMR", {
  skip_if_no_data()
  
  res <- run_dmr()
  df  <- read.csv(file.path(res$job_dir, "dmr_results.csv"), check.names = FALSE)
  
  expect_true(all(c("ID", "N_DMPs", "CHR", "START", "STOP",
                    "WIDTH", "P_VALUE", "MEANDIFF") %in% colnames(df)))
  expect_gt(nrow(df), 0L)
})


test_that("N_DMPs >= 3, WIDTH > 0, P_VALUE in [0,1]", {
  skip_if_no_data()
  
  df <- read.csv(file.path(run_dmr()$job_dir, "dmr_results.csv"),
                 check.names = FALSE)
  
  expect_true(all(df$N_DMPs >= 3))
  expect_true(all(df$WIDTH > 0))
  expect_true(all(df$P_VALUE >= 0 & df$P_VALUE <= 1, na.rm = TRUE))
})


# ══════════════════════════════════════════════════════════════════════════════
# 2  FEHLERFÄLLE
# ══════════════════════════════════════════════════════════════════════════════

test_that("Fehlende Beta-Datei → Exit-Code 1 mit 'error'-Status", {
  skip_if_no_data()
  
  res <- run_dmr(beta = "nicht_vorhanden.rds")
  expect_equal(res$status, 1L)
  expect_true(grepl('"error"', res$stdout))
})


test_that("Ungültiger arraytype → Exit-Code 1", {
  skip_if_no_data()
  
  expect_equal(run_dmr(arraytype = "INVALID")$status, 1L)
})


test_that("Beta mit falscher Spaltenzahl → Exit-Code 1", {
  skip_if_no_data()
  
  tmp <- tempfile(fileext = ".rds")
  saveRDS(readRDS(BETA_PATH)[, 1:2, drop = FALSE], tmp)
  on.exit(unlink(tmp))
  
  expect_equal(run_dmr(beta = tmp)$status, 1L)
})