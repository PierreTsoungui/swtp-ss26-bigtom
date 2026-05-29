library(testthat)

# Importiert das zu testende Skript
source("/app/r_backend/batch_correct.R")

describe("Batch Correction Framework Unit Tests", {
  
  # ── Mock-Daten Konfiguration ───────────────────────────────────────────────
  mock_targets <- data.frame(
    Slide = c("123", "123", "456", "456"),
    Array = c("R01C01", "R01C02", "R01C01", "R01C02"),
    Batch = c("A", "A", "B", "B"),
    Group = c("Tumor", "Normal", "Tumor", "Tumor"),
    SingleLevel = c("Ctrl", "Ctrl", "Ctrl", "Ctrl"),
    stringsAsFactors = FALSE
  )
  
  mock_matrix <- matrix(
    runif(40), nrow = 10, ncol = 4,
    dimnames = list(paste0("cg", 1:10), c("123_R01C01", "123_R01C02", "456_R01C01", "456_R01C02"))
  )

  # ── Testfälle ──────────────────────────────────────────────────────────────
  it("sync_samplesheet aligns sample metadata columns accurately with matrix targets", {
    synced <- sync_samplesheet(mock_matrix, mock_targets)
    expect_equal(nrow(synced), 4)
    expect_equal(synced$Slide, c("123", "123", "456", "456"))
  })

  it("validate_covariates filters single-level properties to protect linear independence", {
    valid_covs <- validate_covariates(mock_targets, "Group, SingleLevel")
    expect_true("Group" %in% valid_covs)
    expect_false("SingleLevel" %in% valid_covs)
  })

  it("validate_covariates skips unknown columns gracefully without interrupting process execution", {
    valid_covs <- validate_covariates(mock_targets, "UnknownColumn")
    expect_equal(length(valid_covs), 0)
  })
})

describe("Pipeline Integration Test", {
  
  it("executes the end-to-end run_batch_correction workflow flawlessly", {
    # Erstellt temporäre Job-Ordner-Struktur
    temp_dir <- tempfile("job_dir_")
    dir.create(temp_dir)
    on.exit(unlink(temp_dir, recursive = TRUE))

    # Erzeuge gefälschtes Samplesheet vor Ort
    samplesheet_data <- data.frame(
      Sample_Name = paste0("S", 1:4),
      Slide = c("10", "10", "20", "20"),
      Array = c("R01", "R02", "R01", "R02"),
      Batch = c("B1", "B1", "B2", "B2")
    )
    write.csv(samplesheet_data, file = file.path(temp_dir, "Mock_SampleSheet.csv"), row.names = FALSE)

    # Erzeuge ein simuliertes normiertes Datenobjekt (Matrix)
    mock_mat <- matrix(
      runif(200), nrow = 50, ncol = 4,
      dimnames = list(paste0("cg", 1:50), c("10_R01", "10_R02", "20_R01", "20_R02"))
    )
    saveRDS(mock_mat, file = file.path(temp_dir, "normalized_data.rds"))

    # Führe Pipeline aus und erwarte keinen Fehler
    expect_error(
      run_batch_correction(temp_dir, batch_var = "Batch"),
      NA
    )

    # Überprüfe, ob das bereinigte File korrekt generiert wurde
    output_file <- file.path(temp_dir, "corrected_data.rds")
    expect_true(file.exists(output_file))
    
    result_mat <- readRDS(output_file)
    expect_equal(dim(result_mat), c(50, 4))
  })
})