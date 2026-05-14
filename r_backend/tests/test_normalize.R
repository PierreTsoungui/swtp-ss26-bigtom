library(testthat)
library(minfi)

# Hilfsfunktion: kleine synthetische RGChannelSet-ähnliche Testdaten
# Wir nutzen die eingebauten minfi Demo-Daten
create_test_rds <- function(tmp_dir) {
  # minfiData hat kleine Demo-IDATs
  if (!requireNamespace("minfiData", quietly = TRUE)) {
    skip("minfiData nicht installiert")
  }
  library(minfiData)

  # RGSet aus minfiData laden und als filtered_data.rds speichern
  data(RGsetEx)
  saveRDS(RGsetEx, file.path(tmp_dir, "filtered_data.rds"))
}

test_that("Normalisierung mit noob erzeugt valide Beta-Werte", {
  tmp <- tempdir()
  create_test_rds(tmp)

  # Script aufrufen
  result <- system2(
    "Rscript",
    args = c("normalize.R", tmp, "noob"),
    stdout = TRUE, stderr = TRUE
  )

  # Ausgabedateien prüfen
  expect_true(file.exists(file.path(tmp, "beta_matrix.rds")))
  expect_true(file.exists(file.path(tmp, "output.csv")))

  # Beta-Werte im validen Bereich
  beta <- readRDS(file.path(tmp, "beta_matrix.rds"))
  expect_true(all(beta >= 0 & beta <= 1, na.rm = TRUE))
})

test_that("Ungültige Methode bricht mit Fehler ab", {
  tmp <- tempdir()
  create_test_rds(tmp)

  expect_error(
    system2("Rscript", args = c("normalize.R", tmp, "ungueltig"),
            stdout = TRUE, stderr = TRUE)
  )
})

test_that("Fehlende filtered_data.rds bricht mit Fehler ab", {
  tmp <- file.path(tempdir(), "leerer_job")
  dir.create(tmp, showWarnings = FALSE)

  result <- system2(
    "Rscript",
    args = c("normalize.R", tmp, "noob"),
    stdout = TRUE, stderr = TRUE
  )

  # Exit code sollte nicht 0 sein
  expect_false(attr(result, "status") == 0)
})