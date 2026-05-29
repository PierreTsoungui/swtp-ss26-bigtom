#' Test für DMP

# ── Verwendete Bibliotheken ───
library(testthat)

# ── Test 1 ───
test_that("DMP läuft und erzeugt Tabelle", {
  
  # Testdaten
  job_dir     <- tempdir()
  beta_file   <- path.expand("~/filtered_data.rds")
  sample_file <- path.expand("~/Demo_EPIC-8v2-0_A1_SampleSheet_16.csv")
  script_path <- path.expand("~/dmp.R")
  
  # Existieren Dateien ?
  expect_true(file.exists(beta_file))
  expect_true(file.exists(sample_file))
  expect_true(file.exists(script_path))
  
  # Ausführen von Test
  exit_code <- system2(
    "Rscript",
    args = c(
      script_path,
      beta_file,
      sample_file,
      job_dir
    )
  )
  
  # Lief das Skript erfolgreich durch ? -> kein Fehler erwartet
  expect_equal(exit_code, 0)
  
  # Output
  output_csv <- file.path(job_dir, "dmp_results.csv")
  output_rds <- file.path(job_dir, "dmp_results.rds")
  
  expect_true(file.exists(output_csv))
  expect_true(file.exists(output_rds))
  
  result <- read.csv(output_csv)
  
  # Ist Tabelle leer ?
  expect_true(nrow(result) > 0)
  
  # Pflichtspalten laut Tabelle
  required_columns <- c(
    "ID",
    "CHR",
    "POS",
    "GENE",
    "FEATURE",
    "CGI",
    "ADJ_P",
    "GROUP1_AVG",
    "GROUP2_AVG",
    "DELTA_BETA",
    "LOG_FC",
    "DMR_ID"
  )
  
  expect_true(
    all(required_columns %in% colnames(result))
  )
  
  # Liegt Adj. P im Normbereich ?
  expect_true(all(result$ADJ_P >= 0))
  expect_true(all(result$ADJ_P <= 1))
  
  # Ist DELTA BETA numerisch ?
  expect_true(is.numeric(result$DELTA_BETA))
  
})

# ── Test 2 ───
test_that("DMP script schlägt fehl mit ungültigem Beta", {
  
  job_dir <- tempdir()
  
  # Ungültige Beta-Datei
  invalid_beta <- matrix()
  beta_file    <- file.path(job_dir, "invalid_beta.rds")
  saveRDS(invalid_beta, beta_file)
  
  sample_file <- path.expand("~/Demo_EPIC-8v2-0_A1_SampleSheet_16.csv")
  expect_true(file.exists(sample_file))
  
  exit_code <- system2(
    "Rscript",
    args = c(
      path.expand("~/dmp.R"),
      beta_file,
      sample_file,
      job_dir
    )
  )
  
  # Lief das Skript erfolgreich durch ? -> Fehler erwartet
  expect_true(exit_code != 0)
  
})