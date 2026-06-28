library(testthat)
library(jsonlite)

# ── Hilfsfunktionen ──────────────────────────────────────────────────────────

SCRIPT_PATH      <- "/app/r_backend/init_filter.R"
#SAMPLESHEET_PATH <- "/app/jobs/07b7fa29-8a9d-418d-bc16-8308a2b387fd/Demo_EPIC-8v2-0_A1_SampleSheet_16.csv"
#IDAT_DIR         <- "/app/jobs/07b7fa29-8a9d-418d-bc16-8308a2b387fd"
SAMPLESHEET_PATH <- "/app/r_backend/daten/450Kdemo-dataset/Samplesheet.csv"
IDAT_DIR <- "/app/r_backend/daten/450Kdemo-dataset/idat"
#' Führt init_filter.R als Subprocess aus und gibt stdout-Zeilen zurück
run_filter_script <- function(job_dir,
                               sample_sheet = SAMPLESHEET_PATH,
                               filter_json  = NULL) {

  # filter_settings.json in job_dir schreiben wenn angegeben
  if (!is.null(filter_json)) {
    write(filter_json, file.path(job_dir, "filter_settings.json"))
  }

  result <- system2(
    "Rscript",
    args   = c(SCRIPT_PATH, sample_sheet, job_dir),
    stdout = TRUE,
    stderr = TRUE
  )

  list(
    lines      = result,
    returncode = attr(result, "status") %||% 0L
  )
}

# Null-coalescing Operator
`%||%` <- function(a, b) if (is.null(a)) b else a

#' Extrahiert JSON-Zeilen aus stdout
parse_json_lines <- function(lines) {
  json_lines <- lines[grepl("^\\s*\\{", lines)]
  lapply(json_lines, function(l) {
    tryCatch(fromJSON(l), error = function(e) NULL)
  }) |> Filter(Negate(is.null), x = _)
}

# ── Tests ─────────────────────────────────────────────────────────────────────

test_that("Script läuft mit Default-Settings erfolgreich durch", {
  job_dir <- tempfile("job_default_")
  dir.create(job_dir)

  # IDAT-Dateien in job_dir verlinken
  file.copy(list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE), job_dir)

  result <- run_filter_script(job_dir)

  expect_equal(result$returncode, 0L,
    label = paste("Script-Exitcode != 0\nOutput:\n",
                  paste(result$lines, collapse = "\n")))
})


test_that("Alle Filterschritte erscheinen in der JSON-Ausgabe", {
  job_dir <- tempfile("job_steps_")
  dir.create(job_dir)
  file.copy(list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE), job_dir)

  # FIX: Wir müssen die Filter aktivieren, damit sie im stdout-JSON auftauchen!
  all_enabled_json <- toJSON(list(
    det_p      = list(enabled = TRUE, cutoff = 0.01),
    bead_count = list(enabled = TRUE, bead_cutoff = 0.05),
    non_cpg    = list(enabled = TRUE),
    snp        = list(enabled = TRUE, maf_cutoff = 0.05),
    multi_hit  = list(enabled = TRUE),
    xy_chromosomes = list(enabled = TRUE)
  ), auto_unbox = TRUE)

  result  <- run_filter_script(job_dir, filter_json = all_enabled_json)
  parsed  <- parse_json_lines(result$lines)
  steps   <- vapply(parsed, function(x) x$step %||% "", character(1))

  expected <- c("Detection P-Value", "Bead Count", "Non-CpG", "SNP", "Multi-Hit", "DONE")
  for (s in expected) {
    expect_true(s %in% steps, label = paste("Schritt fehlt in Ausgabe:", s))
  }
})


test_that("filtered_data.rds wird erstellt und ist valide Beta-Matrix", {
  job_dir  <- tempfile("job_rds_")
  dir.create(job_dir)
  file.copy(list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE), job_dir)

  run_filter_script(job_dir)

  rds_path <- file.path(job_dir, "filtered_data.rds")
  expect_true(file.exists(rds_path), label = "filtered_data.rds wurde nicht erstellt")

  loaded <- tryCatch(readRDS(rds_path), error = function(e) NULL)
  expect_false(is.null(loaded), label = "filtered_data.rds ist kein valides RDS")
  
  # FIX: "MethylSet" als validen Rückgabetyp hinzugefügt
  expect_true(is.matrix(loaded) || inherits(loaded, "RGChannelSet") || inherits(loaded, "MethylSet"),
    label = "Objekt hat unerwarteten Typ")
})


test_that("filter_stats.json wird erstellt und enthält alle Filterschritte", {
  job_dir <- tempfile("job_stats_")
  dir.create(job_dir)
  file.copy(list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE), job_dir)

  run_filter_script(job_dir)

  stats_path <- file.path(job_dir, "filter_stats.json")
  expect_true(file.exists(stats_path), label = "filter_stats.json wurde nicht erstellt")

  stats <- tryCatch(fromJSON(stats_path), error = function(e) NULL)
  expect_false(is.null(stats), label = "filter_stats.json ist kein valides JSON")
  expect_true("total_start"   %in% names(stats))
  expect_true("total_end"     %in% names(stats))
  expect_true("total_removed" %in% names(stats))
  expect_gte(stats$total_start, stats$total_end,
    label = "Filterung hat keine Probes entfernt")
})


test_that("Benutzerdefinierte filter_settings werden korrekt übernommen", {
  job_dir <- tempfile("job_custom_")
  dir.create(job_dir)
  file.copy(list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE), job_dir)

  custom_json <- toJSON(list(
    det_p      = list(enabled = TRUE,  cutoff = 0.05),
    bead_count = list(enabled = FALSE),
    non_cpg    = list(enabled = TRUE),
    snp        = list(enabled = FALSE),
    multi_hit  = list(enabled = TRUE),
    xy_chromosomes = list(enabled = FALSE)
  ), auto_unbox = TRUE)

  result <- run_filter_script(job_dir, filter_json = custom_json)
  expect_equal(result$returncode, 0L)

  # Bead Count soll als DEAKTIVIERT geloggt sein
  expect_true(any(grepl("Bead Count DEAKTIVIERT", result$lines)),
    label = "Bead Count hätte deaktiviert sein sollen")

  # SNP soll als DEAKTIVIERT geloggt sein
  expect_true(any(grepl("SNP DEAKTIVIERT", result$lines)),
    label = "SNP hätte deaktiviert sein sollen")
})


test_that("Script bricht bei fehlendem Samplesheet mit Exit 1 ab", {
  job_dir <- tempfile("job_nosample_")
  dir.create(job_dir)

  result <- suppressWarnings(
    run_filter_script(
      job_dir,
      sample_sheet = "/nicht/vorhanden.csv"
    )
  )

  expect_equal(result$returncode, 1L,
    label = "Script hätte mit Exit 1 abbrechen sollen")
})

# Tests für die fachliche Validierung der Filterlogik und der Datenintegrität
# Debug-Hilfsfunktion 
debug_output <- function(result, label = "Debug") {
  cat("\n", label, "=== RETURN CODE ===\n", sep = "")
  print(result$returncode)
  
  cat("\n", label, "=== OUTPUT ===\n", sep = "")
  cat(paste(result$lines, collapse = "\n"))
  
  cat("\n", label, "=== LINES ===\n", sep = "")
  print(result$lines)
  cat("\n")
}
test_that("Ungültiger det_p Cutoff führt zum Abbruch", {

  job_dir <- tempfile("job_invalid_detp_")
  dir.create(job_dir)

  file.copy(
    list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE),
    job_dir
  )

  invalid_json <- toJSON(list(
    det_p = list(
      enabled = TRUE,
      cutoff = 0.5
    )
  ), auto_unbox = TRUE)

  result <- suppressWarnings(
    run_filter_script(job_dir, filter_json = invalid_json)
  )

  expect_equal(result$returncode, 1L)
})

test_that("Ungültiger SNP Cutoff führt zum Abbruch", {

  job_dir <- tempfile("job_invalid_snp_")
  dir.create(job_dir)

  file.copy(
    list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE),
    job_dir
  )

  invalid_json <- toJSON(list(
    snp = list(
      enabled = TRUE,
      maf_cutoff = 0.5
    )
  ), auto_unbox = TRUE)

  result <- suppressWarnings(
    run_filter_script(job_dir, filter_json = invalid_json)
  )

  expect_equal(result$returncode, 1L)
})

test_that("Keine vollständigen IDAT-Paare führen zum Abbruch", {

  job_dir <- tempfile("job_no_pairs_")
  dir.create(job_dir)

  file.copy(
    list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE),
    job_dir
  )

  file.remove(
    list.files(
      job_dir,
      pattern = "_Red\\.idat$",
      full.names = TRUE
    )
  )

  result <- suppressWarnings(
    run_filter_script(job_dir)
  )
  debug_output(result, "No Pairs")

  expect_equal(result$returncode, 1L)
  expect_true(
  any(grepl(
    "Keine vollständigen IDAT-Paare gefunden",
    result$lines,
    fixed = TRUE
  ))
)

})

test_that("Sample Quality Filter kann aktiviert werden", {

  job_dir <- tempfile("job_sample_quality_")
  dir.create(job_dir)

  file.copy(
    list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE),
    job_dir
  )

  cfg <- toJSON(list(
    sample_quality = list(
      enabled = TRUE,
      detection_p_cutoff = 0.01,
      sample_failure_rate = 0.10,
      remove_failed_samples = TRUE,
      enable_pca_outlier_detection = TRUE
    )
  ), auto_unbox = TRUE)

  result <- run_filter_script(
    job_dir,
    filter_json = cfg
  )
  debug_output(result, "Sample Quality")
  expect_equal(result$returncode, 0L)

  expect_true(
    any(grepl("Sample Quality", result$lines))
  )
})
test_that("Leeres SampleSheet führt zum Fehler", {

  job_dir <- tempfile("job_empty_sheet_")
  dir.create(job_dir)

  empty_sheet <- tempfile(fileext = ".csv")
  writeLines("", empty_sheet)

  result <- suppressWarnings(
    run_filter_script(
      job_dir,
      sample_sheet = empty_sheet
    )
  )
  debug_output(result, "Empty Sheet")
  expect_equal(result$returncode, 1L)
})

test_that("Manipuliertes SampleSheet führt zum Fehler", {

  job_dir <- tempfile("job_bad_sheet_")
  dir.create(job_dir)
  file.copy(
    list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE),
    job_dir
  )

  bad_sheet <- tempfile(fileext = ".csv")

  writeLines(
    c(
      "abc,xyz,test",
      "1,2,3"
    ),
    bad_sheet
  )

  result <- suppressWarnings(
    run_filter_script(
      job_dir,
      sample_sheet = bad_sheet
    )
  )
  debug_output(result, "Bad Sheet")
  expect_equal(result$returncode, 1L)
   expect_true(
    any(grepl("Samplesheet", paste(result$lines, collapse = "\n"), ignore.case = TRUE)) ||
    any(grepl("sheet", paste(result$lines, collapse = "\n"), ignore.case = TRUE))
  )
})

test_that("Filterstatistik ist konsistent", {

  job_dir <- tempfile("job_stats_check_")
  dir.create(job_dir)

  file.copy(
    list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE),
    job_dir
  )

  run_filter_script(job_dir)

  stats <- fromJSON(
    file.path(job_dir, "filter_stats.json")
  )
    
  
  expect_equal(
    stats$total_start,
    stats$total_end + stats$total_removed
  )
})

test_that("Ungültige Sentrix-ID oder Position führt zum Fehler", {

  job_dir <- tempfile("job_invalid_sentrix_")
  dir.create(job_dir)

  file.copy(
    list.files(IDAT_DIR, pattern = "\\.idat$", full.names = TRUE),
    job_dir
  )
  bad_files <- c(
    "SampleA_Grn.idat",
    "SampleA_Red.idat"
  )

  file.create(file.path(job_dir, bad_files))

  result <- suppressWarnings(
    run_filter_script(job_dir)
  )

  debug_output(result, "Invalid Sentrix")

  expect_equal(result$returncode, 1L)
  expect_true(
    any(grepl("Sentrix|IDAT|Format|ungültig", paste(result$lines, collapse = "\n"), ignore.case = TRUE))
  )
})