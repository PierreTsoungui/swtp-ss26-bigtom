# =============================================================================
# END-TO-END PIPELINE INTEGRATION TEST
#
# PURPOSE
#   The per-script suites test each R script in isolation. This suite verifies
#   that the scripts CHAIN correctly — that the output of every step is a valid
#   input to the next — by running the REAL scripts, as the backend does, on a
#   discovered IDAT fixture:
#
#     init_filter.R  ->  filtered_data.rds  (+ array_type.txt, filter_stats.json)
#     normalize.R    ->  normalized_data.rds
#     (beta extract) ->  beta.rds           (getBeta, mirrors BetaExtractionCommand)
#     batch_svd.R    ->  svd_plot.png
#     dmr.R          ->  dmr_results.rds/.csv
#     dmp.R          ->  dmp_results.rds/.csv   (DMR runs first, so DMP can link)
#     heatmap.R      ->  heatmap.png/.pdf
#
#   It asserts each step's exit code + output artifacts AND cross-step invariants
#   (sample set preserved through normalization; probes flow into DMP/DMR; DMPs
#   link to the DMRs discovered upstream).
#
# NOTE
#   This replaces an earlier procedural smoke script that had no assertions, a
#   hardcoded (now non-existent) job path, and a biologically invalid
#   "duplicate the single sample" hack. Fixtures are discovered at runtime and a
#   real two-group dataset with biological signal is required; the whole suite
#   skips cleanly when none is available.
#
#   It is EXPENSIVE (a full EPIC v2 run incl. champ.DMP/DMR ≈ 5–8 min). The chain
#   is executed ONCE and memoised; every test_that below asserts on that result.
# =============================================================================

library(testthat)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

R_BACKEND <- "/app/r_backend"


# ── Fixture discovery ─────────────────────────────────────────────────────────

#' Discover a job directory suitable for a full-pipeline run.
#'
#' Requirements: raw IDATs for every sample referenced by a two-group
#' SampleSheet, an array_type.txt, and a beta.rds used ONLY to pre-check that the
#' two groups carry real biological signal (median |Δβ| >= threshold) — otherwise
#' Bumphunter finds no DMRs and the DMR/heatmap steps have nothing to show.
#'
#' @return list(dir, sheet, array_ids, arraytype) or NULL.
discover_pipeline_fixture <- function(min_delta = 0.03) {
  cands <- list()
  for (d in list.dirs("/app/jobs", recursive = FALSE)) {
    sh <- file.path(d, "SampleSheet.csv")
    at <- file.path(d, "array_type.txt")
    br <- file.path(d, "beta.rds")
    if (!all(file.exists(c(sh, at, br)))) next
    ln <- tryCatch(readLines(sh, warn = FALSE), error = function(e) character(0))
    ds <- grep("^\\[Data\\]", ln)
    skip_n <- if (length(ds)) ds[1] else 0
    s <- tryCatch(read.csv(sh, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE),
      error = function(e) NULL
    )
    if (is.null(s) || !all(c("Sentrix_ID", "Sentrix_Position", "Sample_Group") %in% colnames(s))) next
    if (length(unique(s$Sample_Group)) != 2L) next
    aid <- paste0(s$Sentrix_ID, "_", s$Sentrix_Position)
    if (anyDuplicated(aid)) next
    grn <- file.exists(file.path(d, paste0(aid, "_Grn.idat")))
    red <- file.exists(file.path(d, paste0(aid, "_Red.idat")))
    if (!all(grn) || !all(red)) next # need every IDAT pair
    cands[[length(cands) + 1L]] <- list(
      dir = d, sheet = sh, at = at, br = br, s = s,
      aid = aid, size = file.info(br)$size
    )
  }
  cands <- cands[order(vapply(cands, function(x) x$size, numeric(1)))] # cheapest first
  for (c in cands) {
    b <- tryCatch(readRDS(c$br), error = function(e) NULL)
    if (is.null(b) || !is.matrix(b)) next
    grp <- setNames(c$s$Sample_Group, c$aid)[colnames(b)]
    lv <- unique(grp)
    if (anyNA(grp) || length(lv) != 2L) next
    set.seed(1)
    idx <- sample(nrow(b), min(3000L, nrow(b)))
    delta <- median(abs(rowMeans(b[idx, grp == lv[1], drop = FALSE]) -
      rowMeans(b[idx, grp == lv[2], drop = FALSE])), na.rm = TRUE)
    if (is.finite(delta) && delta >= min_delta) {
      return(list(
        dir = c$dir, sheet = c$sheet, array_ids = c$aid,
        arraytype = readLines(c$at, warn = FALSE)[1]
      ))
    }
  }
  NULL
}

FIXTURE <- discover_pipeline_fixture()


# ── Subprocess helper ─────────────────────────────────────────────────────────

#' Run one pipeline R script as a subprocess and capture its structured result.
#'
#' @param script Script file name under /app/r_backend (or "-e" for inline code).
#' @param args Character vector of arguments.
#' @param inline Optional inline R code (uses `Rscript -e`).
#' @return list(status, lines, stdout, logs).
run_r <- function(script = NULL, args = character(0), inline = NULL) {
  # system2() pastes command + args into a shell command string, so the inline
  # R code (which contains '(', ';', quotes) must be shell-quoted.
  cmd <- if (!is.null(inline)) {
    c("-e", shQuote(inline))
  } else {
    c(shQuote(file.path(R_BACKEND, script)), args)
  }
  out <- suppressWarnings(system2("Rscript", cmd, stdout = TRUE, stderr = TRUE))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(
    function(x) !is.null(x) && is.list(x),
    lapply(out, function(l) tryCatch(jsonlite::fromJSON(l), error = function(e) NULL))
  )
  list(status = as.integer(status), lines = out, stdout = paste(out, collapse = "\n"), logs = logs)
}


# ── The (memoised) full-pipeline run ──────────────────────────────────────────

.pipe <- new.env(parent = emptyenv())

#' Execute the entire pipeline once on the discovered fixture and cache it.
#'
#' Sets up an isolated job directory containing only the raw IDATs and the sample
#' sheet (everything else is regenerated by the scripts), then runs every step in
#' order. Returns the job directory plus the per-step results.
#'
#' @return list(job, steps) where steps is a named list of run_r() results.
run_pipeline_once <- function() {
  if (!is.null(.pipe$res)) {
    return(.pipe$res)
  }

  job <- tempfile("pipe_e2e_")
  dir.create(job)
  # Copy only what a fresh job would have: the raw IDATs + the sample sheet.
  idats <- file.path(FIXTURE$dir, paste0(
    rep(FIXTURE$array_ids, each = 2),
    c("_Grn.idat", "_Red.idat")
  ))
  file.copy(idats, job)
  sheet <- file.path(job, "SampleSheet.csv")
  file.copy(FIXTURE$sheet, sheet)

  steps <- list()

  # 1. Filtering: IDATs + sheet -> filtered_data.rds (+ array_type.txt).
  steps$filter <- run_r("init_filter.R", c(shQuote(sheet), shQuote(job)))

  # 2. Normalization: filtered_data.rds -> normalized_data.rds (NOOB, fast).
  steps$normalize <- run_r("normalize.R", c(shQuote(job), "noob"))

  # 3. Beta extraction (mirrors the backend's BetaExtractionCommand).
  steps$beta <- run_r(inline = sprintf(
    "suppressMessages(library(minfi)); b<-getBeta(readRDS('%s/normalized_data.rds')); saveRDS(b,'%s/beta.rds')",
    job, job
  ))

  # 4. SVD batch diagnostic: beta.rds + sheet -> svd_plot.png.
  steps$svd <- run_r(
    "batch_svd.R",
    c(shQuote(file.path(job, "beta.rds")), shQuote(sheet), shQuote(job), "svd_plot.png")
  )

  # 5. DMR FIRST (so DMP can link to the regions). adjPvalDmr=1 keeps all regions.
  steps$dmr <- run_r(
    "dmr.R",
    c(
      shQuote(sheet), shQuote(job), "beta.rds", "3", "NULL", "1", "1000",
      FIXTURE$arraytype, "2", "1"
    )
  )

  # 6. DMP: keeps all probes (adjPVal ignored); links against dmr_results.rds.
  steps$dmp <- run_r(
    "dmp.R",
    c(shQuote(sheet), shQuote(job), "beta.rds", "1", FIXTURE$arraytype)
  )

  # 7. Heatmap from the DMP table. Select a small CpG subset (single filter
  #    source: the backend writes heatmap_input.csv; here we emulate it).
  if (steps$dmp$status == 0L && file.exists(file.path(job, "dmp_results.rds"))) {
    dmp_ids <- head(as.character(readRDS(file.path(job, "dmp_results.rds"))$ID), 40L)
    write.csv(data.frame(ID = dmp_ids, stringsAsFactors = FALSE),
      file.path(job, "heatmap_input.csv"),
      row.names = FALSE
    )
    steps$heatmap <- run_r(
      "heatmap.R",
      c(shQuote(file.path(job, "dmp_results.rds")), shQuote(sheet), shQuote(job))
    )
  } else {
    steps$heatmap <- list(status = NA_integer_, lines = "skipped (no DMP output)", stdout = "", logs = list())
  }

  .pipe$res <- list(job = job, steps = steps)
  .pipe$res
}

skip_if_no_fixture <- function() {
  skip_if_not(dir.exists(R_BACKEND), "not running inside the r_worker container")
  skip_if(
    is.null(FIXTURE),
    "No IDAT fixture with a two-group, signal-bearing sample sheet under /app/jobs"
  )
}

#' Fail-with-context helper for a pipeline step.
expect_step_ok <- function(step, file = NULL, job = NULL) {
  expect_equal(step$status, 0L, info = step$stdout)
  if (!is.null(file)) {
    expect_true(file.exists(file.path(job, file)),
      info = paste("missing artifact:", file)
    )
  }
}


# ── Step-by-step assertions on the single chained run ─────────────────────────

test_that("step 1 — init_filter.R produces filtered_data.rds and detects the array type", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  expect_step_ok(p$steps$filter, "filtered_data.rds", p$job)
  expect_true(file.exists(file.path(p$job, "array_type.txt")))
  expect_true(file.exists(file.path(p$job, "filter_stats.json")))
  expect_equal(trimws(readLines(file.path(p$job, "array_type.txt"))[1]), FIXTURE$arraytype)

  # A-1: the probe-level selection is persisted for the differential steps as a
  # non-empty character vector of the CpG ids that passed the probe filters.
  passed_path <- file.path(p$job, "passed_probes.rds")
  expect_true(file.exists(passed_path))
  passed <- readRDS(passed_path)
  expect_type(passed, "character")
  expect_gt(length(passed), 0L)
})

test_that("step 2 — normalize.R produces normalized_data.rds preserving all samples", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  expect_step_ok(p$steps$normalize, "normalized_data.rds", p$job)

  filtered <- readRDS(file.path(p$job, "filtered_data.rds"))
  normalized <- readRDS(file.path(p$job, "normalized_data.rds"))
  # The sample set must survive normalization unchanged (order-independent).
  expect_setequal(colnames(normalized), colnames(filtered))
})

test_that("step 3 — beta extraction yields a numeric matrix in [0,1]", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  expect_step_ok(p$steps$beta, "beta.rds", p$job)
  beta <- readRDS(file.path(p$job, "beta.rds"))
  expect_true(is.matrix(beta))
  expect_gt(nrow(beta), 0L)
  expect_gt(ncol(beta), 0L)
  fin <- beta[is.finite(beta)]
  expect_true(min(fin) >= -0.001 && max(fin) <= 1.001) # methylation fractions
})

test_that("step 4 — batch_svd.R renders the SVD association heatmap", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  expect_step_ok(p$steps$svd, "svd_plot.png", p$job)
  expect_gt(file.size(file.path(p$job, "svd_plot.png")), 5000L)
})

test_that("step 5 — dmr.R discovers regions and writes the results table", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  expect_step_ok(p$steps$dmr, "dmr_results.rds", p$job)
  dmr <- readRDS(file.path(p$job, "dmr_results.rds"))
  expect_true(is.data.frame(dmr))
  expect_true(all(c("ID", "N_DMPS", "CHR", "START", "STOP") %in% colnames(dmr)))
  expect_gt(nrow(dmr), 0L) # HeLa/Raji-type signal must yield DMRs (adjPvalDmr=1)
})

test_that("step 6 — dmp.R keeps all probes and links to the upstream DMRs", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  expect_step_ok(p$steps$dmp, "dmp_results.rds", p$job)
  dmp <- readRDS(file.path(p$job, "dmp_results.rds"))
  expect_true(all(c("ID", "DELTA_BETA", "ADJ_P", "DMR_ID") %in% colnames(dmp)))
  expect_gt(nrow(dmp), 0L)
  # Delta Beta is deterministic: GROUP1_AVG - GROUP2_AVG.
  expect_equal(dmp$DELTA_BETA, dmp$GROUP1_AVG - dmp$GROUP2_AVG, tolerance = 1e-6)

  # Cross-step: since DMR ran first and found regions, some DMPs must fall inside
  # a DMR and carry its id (end-to-end DMP<->DMR linkage).
  dmr <- readRDS(file.path(p$job, "dmr_results.rds"))
  if (nrow(dmr) > 0L) expect_true(any(dmp$DMR_ID != "-"))

  # A-1: every analysed probe lies within the persisted probe-level selection —
  # i.e. dmp.R restricted its beta matrix to passed_probes.rds (here all filters
  # are off, so the selection is the full probe set and nothing is wrongly lost).
  passed <- readRDS(file.path(p$job, "passed_probes.rds"))
  expect_true(all(dmp$ID %in% passed))
})

test_that("step 7 — heatmap.R renders a PNG from the DMP table", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  expect_step_ok(p$steps$heatmap, "heatmap.png", p$job)
  expect_gt(file.size(file.path(p$job, "heatmap.png")), 1000L)
})

test_that("the full chain completes without any step emitting an error event", {
  skip_if_no_fixture()
  p <- run_pipeline_once()
  for (nm in names(p$steps)) {
    step <- p$steps[[nm]]
    if (is.na(step$status)) next
    types <- unlist(lapply(step$logs, function(x) x$type %||% NULL))
    expect_false("error" %in% types, info = paste0("step '", nm, "' emitted an error:\n", step$stdout))
  }
})
