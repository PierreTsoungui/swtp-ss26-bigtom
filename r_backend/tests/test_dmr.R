#'  ── Tests für DMR

# ── Verwendete Bibliotheken ───

library(testthat)

# ── Test 1 ───
test_that("DMR läuft und erzeugt Tabelle", {
  
  # Testdaten
  job_dir <- tempdir()
  beta_file <- "filtered_data.rds"
  sample_file <- "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"
  
  # Existieren Dateien ?
  expect_true(file.exists(beta_file))
  expect_true(file.exists(sample_file))
  
  # Ausführen von Test
  script_path <- "dmr.R"
  
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
  output_csv <- file.path(job_dir, "dmr_results.csv")
  output_rds <- file.path(job_dir, "dmr_results.rds")
  
  expect_true(file.exists(output_csv))
  expect_true(file.exists(output_rds))
  
  result <- read.csv(output_csv)
  
  # Ist Tabelle leer ?
  expect_true(nrow(result) > 0)
  
  # Pflichtspalten laut Tabelle
  required_columns <- c(
    "ID",
    "N_DMPs",
    "CHR",
    "START",
    "STOP",
    "WIDTH",
    "P_VALUE",
    "MEANDIFF"
  )
  
  expect_true(
    all(required_columns %in% colnames(result))
  )
  
  # Liegt P-Value im Normbereich ?
  expect_true(all(result$P_VALUE >= 0))
  expect_true(all(result$P_VALUE <= 1))
  
  # Ist N_DMPs eine positive ganze Zahl ?
  expect_true(is.numeric(result$N_DMPs))
  expect_true(all(result$N_DMPs > 0))
  
  # Ist WIDTH numerisch und positiv ?
  expect_true(is.numeric(result$WIDTH))
  expect_true(all(result$WIDTH > 0))
  
  # Ist START immer kleiner als STOP ?
  expect_true(all(result$START < result$STOP))
  
  # Ist MEANDIFF numerisch ?
  expect_true(is.numeric(result$MEANDIFF))
  
  # Haben alle IDs das erwartete Format DMR_N ?
  expect_true(all(grepl("^DMR_\\d+$", result$ID)))
  
})

# ── Test 2 ───
test_that("DMR script schlägt fehl mit ungültigem Beta", {
  
  job_dir <- tempdir()
  
  # Ungültige Beta-Datei
  invalid_beta <- matrix()
  
  beta_file <- file.path(job_dir, "invalid_beta.rds")
  
  saveRDS(invalid_beta, beta_file)
  
  # Reales Sample Sheet
  sample_file <- "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"
  
  expect_true(file.exists(sample_file))
  
  exit_code <- system2(
    "Rscript",
    args = c(
      "dmr.R",
      beta_file,
      sample_file,
      job_dir
    )
  )
  
  # Lief das Skript erfolgreich durch ? -> Fehler erwartet
  expect_true(exit_code != 0)
  
})

# ── Test 3 ───
test_that("DMR script schlägt fehl mit fehlendem Beta", {
  
  job_dir <- tempdir()
  
  exit_code <- system2(
    "Rscript",
    args = c(
      "dmr.R",
      "nicht_vorhanden.rds",
      "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv",
      job_dir
    )
  )
  
  expect_true(exit_code != 0)
  
})

# ── Test 4 ───
test_that("DMR script schlägt fehl mit ungültigen numerischen Parametern", {
  
  job_dir <- tempdir()
  beta_file <- "filtered_data.rds"
  sample_file <- "Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"
  
  expect_true(file.exists(beta_file))
  expect_true(file.exists(sample_file))
  
  exit_code <- system2(
    "Rscript",
    args = c(
      "dmr.R",
      beta_file,
      sample_file,
      job_dir,
      "keine_zahl",   # minProbes ungültig
      "0.2",
      "0.05",
      "500"
    )
  )
  
  expect_true(exit_code != 0)
  
})