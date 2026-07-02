# =============================================================================
# TEST SUITE: normalize.R
#
# CONTRACT UNDER TEST
#   CLI:  Rscript normalize.R <job_dir> <method>            method in
#         {noob, quantile, swan, funnorm}
#   Reads <job_dir>/filtered_data.rds (a sample-filtered RGChannelSet) and writes
#   <job_dir>/normalized_data.rds — the FULL normalized minfi object (a MethylSet
#   for NOOB/SWAN, a GenomicRatioSet for QUANTILE/FUNNORM), NOT a bare beta matrix
#   or CSV. getBeta() is applied downstream, not here.
#   Progress/errors: single-line JSON on stdout; finishes with 100% + "done".
#
# TWO LAYERS
#   1. UNIT — source the script (its pipeline is guarded by `sys.nframe()==0L`, so
#      sourcing only defines the functions) and test the registry + validators
#      directly. emit_error() is replaced by a catchable condition.
#   2. INTEGRATION — run the real script via Rscript on a filtered_data.rds
#      fixture discovered under /app/jobs. The per-method runs are memoised so
#      each normalization executes at most once.
#
# NOTE: the earlier fixtures used minfiData::RGsetEx, which is NOT installed in
# the worker image, so those tests only ever skipped. We instead reuse a real
# filtered_data.rds produced by the pipeline. Everything skips (never fails) when
# the script or a fixture is unavailable.
# =============================================================================

library(testthat)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH <- "/app/r_backend/normalize.R"
METHODS     <- c("noob", "quantile", "swan", "funnorm")


# ══════════════════════════════════════════════════════════════════════════════
# Setup: source functions + catchable emit_error() double
# ══════════════════════════════════════════════════════════════════════════════

normalize_loaded <- tryCatch({
  suppressWarnings(suppressMessages(source(SCRIPT_PATH)))
  assign("emit_error", function(message) {
    stop(structure(class = c("normalize_fatal", "error", "condition"),
                   list(message = as.character(message), call = NULL)))
  }, envir = globalenv())
  exists("assert_valid_beta") && exists("load_filtered_rgset")
}, error = function(e) FALSE)

skip_if_not_loaded <- function() {
  skip_if_not(isTRUE(normalize_loaded),
              paste("normalize.R could not be sourced (run in the r_worker container):", SCRIPT_PATH))
}

#' Assert `expr` triggers a fatal emit_error() matching `regexp`.
expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch({ force(expr); NULL }, normalize_fatal = function(c) c)
  expect_false(is.null(cnd), info = "expected a fatal emit_error() but none was raised")
  if (!is.null(regexp) && !is.null(cnd)) expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
  invisible(cnd)
}
expect_not_fatal <- function(expr) {
  cnd <- tryCatch({ force(expr); NULL }, normalize_fatal = function(c) c)
  expect_null(cnd, info = paste("unexpected fatal error:", if (!is.null(cnd)) conditionMessage(cnd) else ""))
}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── Method registry ───────────────────────────────────────────────────────────

test_that("NORMALIZATION_METHODS registers exactly the supported methods as functions", {
  skip_if_not_loaded()
  expect_setequal(names(NORMALIZATION_METHODS), METHODS)
  expect_true(all(vapply(NORMALIZATION_METHODS, is.function, logical(1))))
})

# ── assert_valid_beta() — validates the beta range on any beta-like matrix ─────
# extract_beta() passes a plain numeric matrix straight through, so we can drive
# every branch of assert_valid_beta() with matrices (no minfi object required).

test_that("assert_valid_beta accepts a matrix fully inside [0, 1]", {
  skip_if_not_loaded()
  expect_not_fatal(assert_valid_beta(matrix(c(0, 0.25, 0.5, 1), nrow = 2)))
  # NAs are tolerated as long as not ALL values are NA and the rest are in range.
  expect_not_fatal(assert_valid_beta(matrix(c(0.2, NA, 0.8, 0.4), nrow = 2)))
})

test_that("assert_valid_beta rejects an empty beta matrix", {
  skip_if_not_loaded()
  expect_fatal(assert_valid_beta(matrix(numeric(0), nrow = 0, ncol = 0)), "empty")
})

test_that("assert_valid_beta rejects an all-NA beta matrix", {
  skip_if_not_loaded()
  expect_fatal(assert_valid_beta(matrix(NA_real_, nrow = 2, ncol = 2)), "only NA")
})

test_that("assert_valid_beta rejects beta values outside [0, 1]", {
  skip_if_not_loaded()
  expect_fatal(assert_valid_beta(matrix(c(0.5, 1.5, -0.2, 0.3), nrow = 2)), "valid range")
})

# ── load_filtered_rgset() — file/type validation ──────────────────────────────

test_that("load_filtered_rgset aborts when filtered_data.rds is absent", {
  skip_if_not_loaded()
  d <- tempfile("job_empty_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  expect_fatal(load_filtered_rgset(d), "not found")
})

test_that("load_filtered_rgset aborts on a corrupted RDS", {
  skip_if_not_loaded()
  d <- tempfile("job_corrupt_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  writeLines("not a valid rds", file.path(d, "filtered_data.rds"))
  expect_fatal(load_filtered_rgset(d), "corrupted")
})

test_that("load_filtered_rgset aborts on the wrong object type", {
  skip_if_not_loaded()
  d <- tempfile("job_wrongtype_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  saveRDS(matrix(runif(20), nrow = 5), file.path(d, "filtered_data.rds"))
  expect_fatal(load_filtered_rgset(d), "unexpected format")
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS (real subprocess + discovered filtered_data.rds fixture)
# ══════════════════════════════════════════════════════════════════════════════

#' Discover the smallest filtered_data.rds (RGChannelSet) under /app/jobs.
#' @return Path to the fixture, or NULL when none exist.
discover_filtered_rds <- function() {
  rds <- list.files("/app/jobs", pattern = "^filtered_data\\.rds$",
                    recursive = TRUE, full.names = TRUE)
  if (!length(rds)) return(NULL)
  rds[which.min(file.info(rds)$size)]
}

FIXTURE_RDS <- if (file.exists(SCRIPT_PATH)) discover_filtered_rds() else NULL

# The input RGChannelSet is read once (for the type/empty unit tests and the
# sample-preservation check); NULL if the fixture cannot be read.
INPUT_RGSET <- if (!is.null(FIXTURE_RDS)) {
  suppressWarnings(suppressMessages(tryCatch(readRDS(FIXTURE_RDS), error = function(e) NULL)))
} else NULL

skip_if_no_fixture <- function() {
  skip_if_not(file.exists(SCRIPT_PATH), "normalize.R not found")
  skip_if(is.null(FIXTURE_RDS), "No filtered_data.rds fixture under /app/jobs")
}

#' Build a job directory holding a copy of the fixture as filtered_data.rds.
new_job_with_fixture <- function() {
  d <- tempfile("job_norm_"); dir.create(d)
  file.copy(FIXTURE_RDS, file.path(d, "filtered_data.rds"))
  d
}

#' Run normalize.R as a subprocess.
#' @return list(status, lines, stdout, job_dir).
run_normalize <- function(job_dir, method) {
  out <- suppressWarnings(system2(
    "Rscript", c(shQuote(SCRIPT_PATH), shQuote(job_dir), shQuote(method)),
    stdout = TRUE, stderr = TRUE
  ))
  status <- attr(out, "status") %||% 0L
  list(status = as.integer(status), lines = out,
       stdout = paste(out, collapse = "\n"), job_dir = job_dir)
}

# Memoise one successful run per method (each normalization is expensive).
.norm_cache <- new.env(parent = emptyenv())
run_method_once <- function(method) {
  if (is.null(.norm_cache[[method]])) {
    job <- new_job_with_fixture()
    .norm_cache[[method]] <- run_normalize(job, method)
  }
  .norm_cache[[method]]
}


# ── load_filtered_rgset() happy + empty (need a real RGChannelSet) ─────────────

test_that("load_filtered_rgset returns the RGChannelSet for a valid fixture", {
  skip_if_no_fixture()
  d <- new_job_with_fixture(); on.exit(unlink(d, recursive = TRUE))
  rg <- load_filtered_rgset(d)
  expect_true(methods::is(rg, "RGChannelSet"))
  expect_gt(ncol(rg), 0L)
})

test_that("load_filtered_rgset aborts on an empty (zero-sample) RGChannelSet", {
  skip_if_no_fixture()
  skip_if(is.null(INPUT_RGSET), "fixture RGChannelSet could not be read")
  d <- tempfile("job_zerocol_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  saveRDS(INPUT_RGSET[, integer(0)], file.path(d, "filtered_data.rds"))  # 0 samples
  expect_fatal(load_filtered_rgset(d), "no samples or no probes")
})

# ── Every method: exit 0, writes a valid normalized object with beta in [0,1] ──

test_that("each normalization method produces a valid normalized_data.rds", {
  skip_if_no_fixture()
  for (m in METHODS) {
    res <- run_method_once(m)
    expect_equal(res$status, 0L, info = paste0("method=", m, "\n", res$stdout))

    out <- file.path(res$job_dir, "normalized_data.rds")
    expect_true(file.exists(out), info = paste("normalized_data.rds missing for", m))

    normalized <- readRDS(out)
    beta <- minfi::getBeta(normalized)
    expect_true(is.matrix(beta), info = paste("getBeta not a matrix for", m))
    expect_true(all(beta >= 0 & beta <= 1, na.rm = TRUE),
                info = paste("beta out of [0,1] for", m))
  }
})

# ── Output integrity (noob, reused from cache) ────────────────────────────────

test_that("the normalized object keeps probe and sample identifiers", {
  skip_if_no_fixture()
  res <- run_method_once("noob")
  expect_equal(res$status, 0L, info = res$stdout)
  beta <- minfi::getBeta(readRDS(file.path(res$job_dir, "normalized_data.rds")))
  expect_false(is.null(rownames(beta)), info = "no probe rownames")
  expect_false(is.null(colnames(beta)), info = "no sample colnames")
})

test_that("normalization preserves the input sample set", {
  skip_if_no_fixture()
  skip_if(is.null(INPUT_RGSET), "fixture RGChannelSet could not be read")
  res <- run_method_once("noob")
  normalized <- readRDS(file.path(res$job_dir, "normalized_data.rds"))
  expect_setequal(colnames(normalized), colnames(INPUT_RGSET))
})

# ── Reproducibility: SWAN is seeded, so two runs must be identical ─────────────

test_that("SWAN normalization is reproducible (fixed seed)", {
  # preprocessSWAN randomly subsets probes; normalize.R sets.seed(42), so a
  # re-run must yield byte-identical beta values (stable Δβ / p-values downstream).
  skip_if_no_fixture()
  res1 <- run_method_once("swan")
  expect_equal(res1$status, 0L, info = res1$stdout)

  job2 <- new_job_with_fixture(); on.exit(unlink(job2, recursive = TRUE), add = TRUE)
  res2 <- run_normalize(job2, "swan")
  expect_equal(res2$status, 0L, info = res2$stdout)

  b1 <- minfi::getBeta(readRDS(file.path(res1$job_dir, "normalized_data.rds")))
  b2 <- minfi::getBeta(readRDS(file.path(job2,          "normalized_data.rds")))
  expect_identical(dim(b1), dim(b2))
  expect_equal(b1, b2, tolerance = 0)
})

# ── Robustness: bad input fails cleanly (non-zero exit, no raw R crash) ────────

test_that("missing arguments exit non-zero with a usage error", {
  skip_if_not(file.exists(SCRIPT_PATH), "script not found")
  out <- suppressWarnings(system2("Rscript", shQuote(SCRIPT_PATH), stdout = TRUE, stderr = TRUE))
  code <- attr(out, "status") %||% 0L
  expect_true(code != 0L)
  expect_match(paste(out, collapse = "\n"), "Too few arguments")
})

test_that("an invalid method is rejected before any heavy computation", {
  skip_if_no_fixture()
  d <- new_job_with_fixture(); on.exit(unlink(d, recursive = TRUE))
  res <- run_normalize(d, "invalid_method_xyz")
  expect_true(res$status != 0L)
  expect_match(res$stdout, "Invalid method")
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("a missing filtered_data.rds is reported clearly", {
  skip_if_not(file.exists(SCRIPT_PATH), "script not found")
  d <- tempfile("job_nofile_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  res <- run_normalize(d, "noob")
  expect_true(res$status != 0L)
  expect_match(res$stdout, "not found")
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("a corrupted filtered_data.rds is reported clearly", {
  skip_if_not(file.exists(SCRIPT_PATH), "script not found")
  d <- tempfile("job_corrupt2_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  writeLines("garbage", file.path(d, "filtered_data.rds"))
  res <- run_normalize(d, "noob")
  expect_true(res$status != 0L)
  expect_match(res$stdout, "corrupted")
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("a wrong-type filtered_data.rds is reported clearly", {
  skip_if_not(file.exists(SCRIPT_PATH), "script not found")
  d <- tempfile("job_wrong2_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  saveRDS(matrix(runif(20), nrow = 5), file.path(d, "filtered_data.rds"))
  res <- run_normalize(d, "noob")
  expect_true(res$status != 0L)
  expect_match(res$stdout, "unexpected format")
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})
