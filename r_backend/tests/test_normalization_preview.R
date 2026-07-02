# =============================================================================
# TEST SUITE: normalization_preview.R
#
# PURPOSE
#   Confidence that normalization_preview.R is correct and robust: it must
#   produce the right artifacts on good input and fail cleanly (structured error,
#   non-zero exit) on every bad input — never crash silently or claim success
#   when it did nothing.
#
# CONTRACT UNDER TEST
#   CLI:  Rscript normalization_preview.R <filtered_data.rds> <job_dir> <sheet.csv>
#   Per method m in {raw, noob, quantile, swan, funnorm}:
#     - density_<m>.png  (inline)   -> valid, non-trivial PNG
#     - density_<m>.pdf  (export)   -> valid, non-trivial PDF
#     - pca_<m>.json     (interactive) -> {method, axes, variance_explained,
#                                          points:[{sample,group,pc1,pc2}, ...]}
#   Progress: single-line JSON on stdout; finishes with 100% and {"type":"done"}.
#
# TWO LAYERS
#   1. UNIT — source the script (its pipeline is guarded by `sys.nframe()==0L`,
#      so sourcing only defines the functions) and test the pure helpers
#      (read_sample_sheet, write_pca_json, write_pca_error_json) across all
#      branches. emit_error() is replaced by a catchable condition.
#   2. INTEGRATION — run the real script via Rscript on a filtered_data.rds +
#      matching SampleSheet.csv fixture discovered under /app/jobs. The (slow)
#      5-method happy-path run is executed ONCE and reused across assertions.
#
# Everything is skipped (never failed) when the script or a fixture is missing,
# so the suite is safe in any environment; it is designed for the R worker
# container where the utils/ absolute paths and minfi are available.
# =============================================================================

library(testthat)
library(jsonlite)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH      <- "/app/r_backend/normalization_preview.R"
EXPECTED_METHODS <- c("raw", "noob", "quantile", "swan", "funnorm")


# ══════════════════════════════════════════════════════════════════════════════
# Setup: source the functions and install a catchable emit_error() test double
# ══════════════════════════════════════════════════════════════════════════════

preview_loaded <- tryCatch({
  suppressWarnings(suppressMessages(source(SCRIPT_PATH)))
  # emit_error() normally prints JSON and quits the process; for unit testing we
  # make it raise a catchable condition instead (bound in globalenv, the sourced
  # functions' enclosure, so their calls resolve to it).
  assign("emit_error", function(message) {
    stop(structure(class = c("preview_fatal", "error", "condition"),
                   list(message = as.character(message), call = NULL)))
  }, envir = globalenv())
  exists("write_pca_json") && exists("read_sample_sheet")
}, error = function(e) FALSE)

skip_if_not_loaded <- function() {
  skip_if_not(isTRUE(preview_loaded),
              paste("normalization_preview.R could not be sourced (run in the r_worker container):", SCRIPT_PATH))
}

#' Assert that `expr` triggers a fatal emit_error() carrying `regexp`.
expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch({ force(expr); NULL }, preview_fatal = function(c) c)
  expect_false(is.null(cnd), info = "expected a fatal emit_error() but none was raised")
  if (!is.null(regexp) && !is.null(cnd)) expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
  invisible(cnd)
}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── read_sample_sheet() ───────────────────────────────────────────────────────

test_that("read_sample_sheet parses a plain CSV", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".csv"); on.exit(unlink(f))
  writeLines(c("Sample_Name,Sentrix_ID,Sentrix_Position,Sample_Group",
               "S1,200000000001,R01C01,A"), f)
  sheet <- read_sample_sheet(f)
  expect_s3_class(sheet, "data.frame")
  expect_equal(nrow(sheet), 1L)
  expect_true(all(c("Sentrix_ID", "Sentrix_Position", "Sample_Group") %in% colnames(sheet)))
})

test_that("read_sample_sheet skips the Illumina [Data] preamble", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".csv"); on.exit(unlink(f))
  writeLines(c("[Header]", "Investigator,X", "", "[Data]",
               "Sample_Name,Sentrix_ID,Sentrix_Position",
               "S1,200000000001,R01C01",
               "S2,200000000001,R02C01"), f)
  sheet <- read_sample_sheet(f)
  expect_equal(nrow(sheet), 2L)
  expect_true("Sentrix_Position" %in% colnames(sheet))
})

test_that("read_sample_sheet aborts on a missing file", {
  skip_if_not_loaded()
  expect_fatal(read_sample_sheet("/does/not/exist.csv"), "could not be found")
})

# ── write_pca_json() — happy path & payload structure ─────────────────────────

#' Build a beta-like matrix with `nrow` variable probes and `ncol` samples.
make_beta <- function(nrow, ncol, colnames = paste0("A", seq_len(ncol))) {
  set.seed(7)
  m <- matrix(runif(nrow * ncol), nrow = nrow, ncol = ncol)
  if (!is.null(colnames)) colnames(m) <- colnames
  m
}

test_that("write_pca_json writes the full interactive-plot payload", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  b <- make_beta(60, 3, c("arr1", "arr2", "arr3"))

  write_pca_json(b, f, "NOOB",
                 sample_labels = c("HeLa", "Raji", "Jurkat"),
                 sample_groups = c("case", "control", "case"))
  pj <- jsonlite::fromJSON(f, simplifyVector = FALSE)

  expect_equal(pj$method, "NOOB")
  expect_equal(pj$axes$x, "PC1"); expect_equal(pj$axes$y, "PC2")
  expect_true(is.numeric(pj$variance_explained$pc1))
  expect_true(is.numeric(pj$variance_explained$pc2))
  expect_length(pj$points, 3L)

  # Labels and groups must stay aligned to the sample (column) order.
  expect_equal(vapply(pj$points, function(p) p$sample, ""), c("HeLa", "Raji", "Jurkat"))
  expect_equal(vapply(pj$points, function(p) p$group,  ""), c("case", "control", "case"))
  for (pt in pj$points) {
    expect_true(all(c("sample", "group", "pc1", "pc2") %in% names(pt)))
    expect_true(is.numeric(pt$pc1) && is.numeric(pt$pc2))
  }
})

test_that("write_pca_json falls back sensibly for mismatched labels/groups", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  b <- make_beta(40, 3, c("c1", "c2", "c3"))

  # Wrong-length labels -> use column names; wrong-length groups -> empty groups.
  write_pca_json(b, f, "RAW",
                 sample_labels = c("only_one"),
                 sample_groups = c("g1", "g2"))
  pj <- jsonlite::fromJSON(f, simplifyVector = FALSE)
  expect_equal(vapply(pj$points, function(p) p$sample, ""), c("c1", "c2", "c3"))
  expect_true(all(vapply(pj$points, function(p) p$group, "") == ""))
})

test_that("write_pca_json falls back to generic labels without colnames or labels", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  b <- make_beta(40, 3, colnames = NULL)
  write_pca_json(b, f, "RAW")
  pj <- jsonlite::fromJSON(f, simplifyVector = FALSE)
  expect_equal(vapply(pj$points, function(p) p$sample, ""), c("Sample_1", "Sample_2", "Sample_3"))
})

test_that("write_pca_json drops invariant/non-finite probes before PCA", {
  # 15 variable probes (kept) + 15 constant probes (dropped) -> PCA still runs.
  skip_if_not_loaded()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  variable <- make_beta(15, 3, c("a", "b", "c"))
  constant <- matrix(0.5, nrow = 15, ncol = 3, dimnames = list(NULL, c("a", "b", "c")))
  b <- rbind(variable, constant)
  expect_silent(write_pca_json(b, f, "RAW"))
  expect_length(jsonlite::fromJSON(f, simplifyVector = FALSE)$points, 3L)
})

# ── write_pca_json() — error branches ─────────────────────────────────────────

test_that("write_pca_json rejects fewer than three samples", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  expect_error(write_pca_json(make_beta(50, 2), f, "RAW"), "at least 3 samples")
  expect_error(write_pca_json(NULL, f, "RAW"), "at least 3 samples")
})

test_that("write_pca_json rejects too few valid CpGs after cleaning", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  # Only 5 variable probes remain after invariant removal -> below the 10 minimum.
  expect_error(write_pca_json(make_beta(5, 3), f, "RAW"), "Not enough valid CpGs")
})

# ── write_pca_error_json() ────────────────────────────────────────────────────

test_that("write_pca_error_json writes a well-formed error payload", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".json"); on.exit(unlink(f))
  write_pca_error_json(f, "SWAN", "boom")
  pj <- jsonlite::fromJSON(f, simplifyVector = FALSE)
  expect_equal(pj$method, "SWAN")
  expect_equal(pj$error, "boom")
  expect_length(pj$points, 0L)
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS (real subprocess + discovered fixture)
# ══════════════════════════════════════════════════════════════════════════════

#' Discover the smallest filtered_data.rds + matching SampleSheet.csv fixture.
#'
#' Scans /app/jobs for a directory that holds both files with the Sentrix columns
#' required for sample mapping, preferring the smallest RDS for speed.
#'
#' @return list(rds, sheet) or NULL when no fixture is available.
discover_preview_fixture <- function() {
  cand <- list()
  for (d in list.dirs("/app/jobs", recursive = FALSE)) {
    rds <- file.path(d, "filtered_data.rds"); sh <- file.path(d, "SampleSheet.csv")
    if (file.exists(rds) && file.exists(sh)) {
      hdr <- tryCatch(readLines(sh, n = 40, warn = FALSE), error = function(e) character(0))
      if (any(grepl("Sentrix_ID", hdr)) && any(grepl("Sentrix_Position", hdr))) {
        cand[[length(cand) + 1L]] <- list(rds = rds, sheet = sh, size = file.info(rds)$size)
      }
    }
  }
  if (!length(cand)) return(NULL)
  cand[[which.min(vapply(cand, function(x) x$size, numeric(1)))]]
}

FIXTURE <- if (file.exists(SCRIPT_PATH)) discover_preview_fixture() else NULL

skip_if_no_fixture <- function() {
  skip_if_not(file.exists(SCRIPT_PATH), "normalization_preview.R not found")
  skip_if(is.null(FIXTURE), "No filtered_data.rds + SampleSheet.csv fixture under /app/jobs")
}

#' Run normalization_preview.R as a subprocess and capture its result.
#'
#' @return list(status, lines, stdout, logs, job_dir).
run_preview <- function(rds = FIXTURE$rds, samples = FIXTURE$sheet,
                        job_dir = tempfile("preview_out_")) {
  if (!dir.exists(job_dir)) dir.create(job_dir, recursive = TRUE)
  out <- suppressWarnings(system2(
    "Rscript", c(shQuote(SCRIPT_PATH), shQuote(rds), shQuote(job_dir), shQuote(samples)),
    stdout = TRUE, stderr = TRUE
  ))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(Negate(is.null),
                 lapply(out, function(l) tryCatch(jsonlite::fromJSON(l), error = function(e) NULL)))
  list(status = as.integer(status), lines = out,
       stdout = paste(out, collapse = "\n"), logs = logs, job_dir = job_dir)
}

# The full 5-method run is expensive; execute it ONCE and reuse it across the
# happy-path / output / biological assertions.
.shared <- new.env(parent = emptyenv())
shared_run <- function() {
  if (is.null(.shared$res)) .shared$res <- run_preview()
  .shared$res
}

error_messages <- function(logs) unlist(lapply(logs, function(x) if (identical(x$type, "error")) x$message else NULL))
success_signalled <- function(logs) {
  types <- unlist(lapply(logs, function(x) x$type))
  pcts  <- unlist(lapply(logs, function(x) x$percent))
  ("done" %in% types) || (100 %in% pcts)
}
file_has_magic <- function(path, magic) {
  if (!file.exists(path)) return(FALSE)
  con <- file(path, "rb"); on.exit(close(con))
  bytes <- readBin(con, what = "raw", n = length(magic))
  length(bytes) == length(magic) && all(bytes == magic)
}
is_png <- function(p) file_has_magic(p, as.raw(c(0x89, 0x50, 0x4E, 0x47)))
is_pdf <- function(p) file_has_magic(p, as.raw(c(0x25, 0x50, 0x44, 0x46)))

# ── Technical layer: runs, signals success, writes every artifact ─────────────

test_that("pipeline runs, signals completion, and writes every artifact", {
  skip_if_no_fixture()
  res <- shared_run()

  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(success_signalled(res$logs), info = "no 100%/'done' completion signal")
  expect_length(error_messages(res$logs), 0)

  for (m in EXPECTED_METHODS) {
    expect_true(file.exists(file.path(res$job_dir, paste0("density_", m, ".png"))), info = paste("PNG missing:", m))
    expect_true(file.exists(file.path(res$job_dir, paste0("density_", m, ".pdf"))), info = paste("PDF missing:", m))
    expect_true(file.exists(file.path(res$job_dir, paste0("pca_", m, ".json"))),    info = paste("JSON missing:", m))
  }
})

# ── Output layer: artifacts are valid ─────────────────────────────────────────

test_that("density plots are valid, non-trivial PNG and PDF files", {
  skip_if_no_fixture()
  res <- shared_run()
  expect_equal(res$status, 0L, info = res$stdout)

  for (m in EXPECTED_METHODS) {
    png <- file.path(res$job_dir, paste0("density_", m, ".png"))
    pdf <- file.path(res$job_dir, paste0("density_", m, ".pdf"))
    expect_true(is_png(png), info = paste("not a PNG:", m))
    expect_gt(file.info(png)$size, 1000)
    expect_true(is_pdf(pdf), info = paste("not a PDF:", m))
    expect_gt(file.info(pdf)$size, 500)
  }
})

test_that("PCA JSON is well-formed and covers all samples consistently", {
  skip_if_no_fixture()
  res <- shared_run()
  expect_equal(res$status, 0L, info = res$stdout)

  counts <- integer(0)
  for (m in EXPECTED_METHODS) {
    pca <- jsonlite::fromJSON(file.path(res$job_dir, paste0("pca_", m, ".json")), simplifyVector = FALSE)
    expect_equal(toupper(pca$method %||% ""), toupper(m))
    if (!is.null(pca$error)) next   # a per-method error payload is also valid

    expect_gte(length(pca$points), 3L)
    expect_true(is.numeric(pca$variance_explained$pc1))
    expect_true(is.numeric(pca$variance_explained$pc2))
    for (pt in pca$points) {
      expect_true(all(c("sample", "group", "pc1", "pc2") %in% names(pt)))
      expect_true(is.numeric(pt$pc1) && is.numeric(pt$pc2))
    }
    counts <- c(counts, length(pca$points))
  }
  if (length(counts) > 1L) expect_equal(length(unique(counts)), 1L,
                                        info = paste("inconsistent sample counts:", paste(counts, collapse = ",")))
})

# ── Biological layer: group/phenotype is carried into the PCA payload ─────────

test_that("the biological Sample_Group is propagated into the PCA JSON", {
  skip_if_no_fixture()
  res <- shared_run()
  pca <- jsonlite::fromJSON(file.path(res$job_dir, "pca_raw.json"), simplifyVector = FALSE)
  skip_if(!is.null(pca$error), "raw PCA emitted an error payload on this fixture")
  groups <- vapply(pca$points, function(p) as.character(p$group %||% ""), character(1))
  expect_true(any(nzchar(groups)), info = "no Sample_Group propagated into the PCA JSON")
})

# ── Robustness layer: bad input fails cleanly (non-zero exit, clear message) ───

test_that("missing arguments are rejected with a usage error", {
  skip_if_not(file.exists(SCRIPT_PATH), "script not found")
  out <- suppressWarnings(system2("Rscript", shQuote(SCRIPT_PATH), stdout = TRUE, stderr = TRUE))
  code <- attr(out, "status") %||% 0L
  expect_true(code != 0L)
  expect_match(paste(out, collapse = "\n"), "Usage", fixed = TRUE)
})

test_that("a missing filtered_data.rds is reported clearly", {
  skip_if_no_fixture()
  res <- run_preview(rds = "/tmp/does_not_exist_preview.rds")
  expect_true(res$status != 0L)
  expect_match(res$stdout, "could not be found")
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("a corrupted RDS is reported clearly, not a hard crash", {
  skip_if_no_fixture()
  broken <- tempfile(fileext = ".rds"); writeLines("not an rds", broken); on.exit(unlink(broken))
  res <- run_preview(rds = broken)
  expect_true(res$status != 0L)
  expect_match(res$stdout, "could not be read")
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("a valid RDS with the wrong object type is rejected", {
  skip_if_no_fixture()
  wrong <- tempfile(fileext = ".rds")
  m <- matrix(runif(20), nrow = 5, dimnames = list(NULL, paste0("S", 1:4)))
  saveRDS(m, wrong); on.exit(unlink(wrong))
  res <- run_preview(rds = wrong)
  expect_true(res$status != 0L)
  expect_match(res$stdout, "unexpected format")
})

test_that("a missing sample sheet is reported clearly", {
  skip_if_no_fixture()
  res <- run_preview(samples = "/tmp/does_not_exist_sheet.csv")
  expect_true(res$status != 0L)
  expect_match(res$stdout, "could not be found")
})

test_that("a sample sheet without Sentrix columns is rejected", {
  skip_if_no_fixture()
  bad <- tempfile(fileext = ".csv")
  writeLines(c("Sample_Name,Sample_Group", "S1,A", "S2,B"), bad); on.exit(unlink(bad))
  res <- run_preview(samples = bad)
  expect_true(res$status != 0L)
  expect_match(res$stdout, "missing required column")
})

# ── Stability layer: re-running over the same directory stays correct ─────────

test_that("re-running into the same job directory is stable and idempotent", {
  skip_if_no_fixture()
  job_dir <- tempfile("preview_rerun_"); on.exit(unlink(job_dir, recursive = TRUE), add = TRUE)
  res1 <- run_preview(job_dir = job_dir)
  res2 <- run_preview(job_dir = job_dir)   # overwrite the same outputs
  expect_equal(res1$status, 0L, info = res1$stdout)
  expect_equal(res2$status, 0L, info = res2$stdout)
  for (m in EXPECTED_METHODS) {
    expect_true(is_png(file.path(job_dir, paste0("density_", m, ".png"))), info = paste("PNG invalid after re-run:", m))
    expect_true(is_pdf(file.path(job_dir, paste0("density_", m, ".pdf"))), info = paste("PDF invalid after re-run:", m))
    expect_silent(jsonlite::fromJSON(file.path(job_dir, paste0("pca_", m, ".json")), simplifyVector = FALSE))
  }
})
