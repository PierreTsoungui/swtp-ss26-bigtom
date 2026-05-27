# Verwendete Bibliotheken
library(testthat)
library(jsonlite)
library(minfi)

# Ausführung
source("init_filter.R")


# Echte Testdaten laden (einmal für beide Tests)
SAMPLESHEET_PATH <- "/home/tubaa/data/Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"
IDAT_BASE        <- "/home/tubaa/data"

load_test_rgset <- function() {
  raw_lines   <- readLines(SAMPLESHEET_PATH)
  data_start  <- which(grepl("^\\[Data\\]", raw_lines))
  sheet       <- read.csv(
    text      = paste(raw_lines[(data_start + 1):length(raw_lines)], collapse = "\n"),
    stringsAsFactors = FALSE
  )
  
  sentrix_ids <- unique(sheet$Sentrix_ID)
  idat_dirs   <- file.path(IDAT_BASE, as.character(sentrix_ids))

  idat_dirs <- idat_dirs[dir.exists(idat_dirs)]
  if (length(idat_dirs) == 0L) stop("Keine IDAT-Verzeichnisse gefunden unter: ", IDAT_BASE)
  
  targets <- sheet[sheet$Sentrix_ID %in% sentrix_ids, ]
  targets$Basename <- file.path(IDAT_BASE,targets$Sentrix_ID,paste0(targets$Sentrix_ID, "_", targets$Sentrix_Position))
 
  valid <- file.exists(paste0(targets$Basename, "_Red.idat")) & file.exists(paste0(targets$Basename, "_Grn.idat"))
  targets <- targets[valid, ]
  
  if (nrow(targets) == 0L) stop("Keine vollständigen IDAT-Paare gefunden.")
  
  message("Lade ", nrow(targets), " Samples aus echten IDATs...")
  read.metharray(targets$Basename, verbose = FALSE)
}

# Einmal laden, in Variable cachen (verhindert doppeltes Einlesen)
rgset <- load_test_rgset()


# Hilfsfunktion: stdout abfangen

capture_filter_output <- function(...) {
  output_lines <- character(0)
  con <- textConnection("output_lines", open = "w", local = TRUE)
  sink(con)
  on.exit({ sink(); close(con) }, add = TRUE)
  suppressWarnings(suppressMessages(filter_raw_data(...)))
  output_lines
}


# TEST 1 – Ausgabe enthält die Mindestanzahl an Filterschritten
test_that("Ausgabe enthält alle erwarteten Filterschritte als JSON-Progress-Meldungen", {
  tmp_dir <- tempdir()
  output_lines <- capture_filter_output(
    raw_data = rgset,
    job_dir  = tmp_dir,
    save_rds = FALSE,
    steps    = c("detP", "beadcount", "non_cpg", "snp", "multi_hit")
  )

  # Nur JSON-Zeilen extrahieren
  json_lines <- output_lines[grepl("^\\s*\\{", output_lines)]
  
  expect_true(length(json_lines) >= 1, label = "Mindestens eine JSON-Zeile muss ausgegeben werden")
  
  # step-Felder aus allen JSON-Zeilen sammeln
  parsed <- lapply(json_lines, function(l) {
    tryCatch(fromJSON(l), error = function(e) NULL)
  })
  parsed        <- Filter(Negate(is.null), parsed)
  emitted_steps <- vapply(parsed, `[[`, character(1L), "step")
  
  # Jeder dieser Steps muss mindestens einmal vorkommen
  expected_steps <- c("Detection P-Value", "Bead Count", "Non-CpG", "SNP", "Multi-Hit", "DONE")
  
  for (s in expected_steps) {
    expect_true(
      s %in% emitted_steps,
      label = paste0("Schritt '", s, "' fehlt in der JSON-Ausgabe")
    )
  }
  
  expect_gte(length(json_lines), 7L, label = "Mindestens 7 JSON-Progress-Meldungen erwartet")
  
  expect_equal(emitted_steps[length(emitted_steps)], "DONE", label = "Letzter emittierter Step muss 'DONE' sein")
})


# TEST 2 – Gespeicherte Datei ist valides RDS-Objekt
test_that("Gespeicherte RDS-Datei ist eine valide numerische Beta-Matrix", {
  tmp_dir  <- tempdir()
  rds_path <- file.path(tmp_dir, "filtered_data.rds")
  if (file.exists(rds_path)) file.remove(rds_path)
  suppressWarnings(suppressMessages(
    filter_raw_data(raw_data = rgset, job_dir  = tmp_dir,
      save_rds = TRUE,
      steps    = c("detP", "beadcount", "non_cpg", "snp", "multi_hit")
    )
  ))
  expect_true(file.exists(rds_path),label = "filtered_data.rds wurde nicht erzeugt")
  # Lesbarkeit
  loaded <- tryCatch(readRDS(rds_path), error = function(e) NULL)
  expect_false(is.null(loaded),label = "readRDS() schlug fehl – Datei ist kein valides RDS")
  # Typ
  expect_true(is.matrix(loaded),  label = "Geladenes Objekt ist keine Matrix")
  expect_true(is.numeric(loaded), label = "Matrix-Werte sind nicht numerisch")
  # Beta-Wertebereich [0, 1] (NA toleriert)
  non_na <- loaded[!is.na(loaded)]
  expect_true(all(non_na >= 0 & non_na <= 1),label = "Beta-Werte liegen nicht vollständig im Bereich [0, 1]")
  
  # Dimensionen
  expect_gte(nrow(loaded), 1L, label = "RDS-Matrix hat keine Zeilen (Probes)")
  expect_gte(ncol(loaded), 1L, label = "RDS-Matrix hat keine Spalten (Samples)")
  
  # Anzahl Probes muss nach Filterung kleiner sein als Ausgangswert
  expect_lt(
    nrow(loaded), nrow(rgset),
    label = "Filterung hat keine Probes entfernt – Beta-Matrix unverändert"
  )
})