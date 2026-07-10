# =============================================================================
# UNIT TESTS: utils/beta.R
#
# Composable beta-matrix building blocks: extract_beta (coerce any supported
# object), load_beta_matrix (read+validate RDS), clamp_beta, drop_invariant_probes
# and impute_row_means. load_beta_matrix reports fatal problems via emit_error(),
# which is replaced here by a catchable condition.
# =============================================================================

library(testthat)

source("/app/r_backend/utils/progress.R")
assign("emit_error", function(message) {
  stop(structure(
    class = c("util_fatal", "error", "condition"),
    list(message = as.character(message), call = NULL)
  ))
}, envir = globalenv())
source("/app/r_backend/utils/beta.R")

expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch(
    {
      force(expr)
      NULL
    },
    util_fatal = function(c) c
  )
  expect_false(is.null(cnd), info = "expected a fatal emit_error() but none was raised")
  if (!is.null(regexp) && !is.null(cnd)) expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
}

# ── extract_beta() ────────────────────────────────────────────────────────────

test_that("extract_beta returns a numeric matrix for plain matrices and data frames", {
  m <- matrix(1:6, nrow = 2, dimnames = list(c("cg1", "cg2"), c("s1", "s2", "s3")))
  out <- extract_beta(m)
  expect_true(is.matrix(out))
  expect_equal(storage.mode(out), "double") # coerced to numeric
  expect_equal(rownames(out), c("cg1", "cg2")) # names preserved

  df <- data.frame(s1 = c(0.1, 0.2), s2 = c(0.3, 0.4), row.names = c("cg1", "cg2"))
  outd <- extract_beta(df)
  expect_true(is.matrix(outd))
  expect_equal(dim(outd), c(2L, 2L))
})

test_that("extract_beta handles a real minfi RGChannelSet (preprocessRaw -> getBeta)", {
  # The S4 path is the one used in production (init_filter writes an RGChannelSet);
  # exercise it on a discovered fixture. Raw channel sets have no direct getBeta,
  # so extract_beta must preprocessRaw() first and still return beta in [0, 1].
  rds <- head(list.files("/app/jobs",
    pattern = "^filtered_data\\.rds$",
    recursive = TRUE, full.names = TRUE
  ), 1L)
  skip_if(length(rds) == 0L, "no filtered_data.rds fixture under /app/jobs")
  obj <- suppressWarnings(suppressMessages(readRDS(rds)))
  skip_if_not(methods::is(obj, "RGChannelSet"), "fixture is not an RGChannelSet")
  suppressWarnings(suppressMessages(library(minfi)))

  beta <- extract_beta(obj)
  expect_true(is.matrix(beta))
  expect_equal(storage.mode(beta), "double")
  expect_equal(ncol(beta), ncol(obj)) # one column per sample
  fin <- beta[is.finite(beta)]
  expect_true(min(fin) >= 0 && max(fin) <= 1) # methylation fractions
})

# ── clamp_beta() ──────────────────────────────────────────────────────────────

test_that("clamp_beta clamps only finite out-of-range values, leaving NA/Inf intact", {
  m <- matrix(c(-0.5, 0.5, 1.5, NA, Inf, 0.2), nrow = 2)
  out <- clamp_beta(m)
  expect_equal(out[1, 1], 0) # -0.5 -> 0
  expect_equal(out[1, 2], 1) # 1.5  -> 1
  expect_equal(out[2, 2], NA_real_) # NA untouched
  expect_true(is.infinite(out[1, 3])) # Inf untouched (not finite)
  expect_equal(out[2, 3], 0.2) # in range -> unchanged
})

test_that("clamp_beta honours custom bounds", {
  # Column-major layout: [1,1]=0.1, [2,1]=0.9, [1,2]=0.5, [2,2]=0.5.
  m <- matrix(c(0.1, 0.9, 0.5, 0.5), nrow = 2)
  out <- clamp_beta(m, lo = 0.2, hi = 0.8)
  expect_equal(out[1, 1], 0.2) # 0.1 -> lower bound
  expect_equal(out[2, 1], 0.8) # 0.9 -> upper bound
  expect_equal(out[1, 2], 0.5) # in range -> unchanged
})

# ── drop_invariant_probes() ───────────────────────────────────────────────────

test_that("drop_invariant_probes removes constant and non-finite rows, keeps variable ones", {
  m <- matrix(c(
    0.5, 0.5, 0.5, # constant   -> dropped
    0.1, 0.9, 0.5, # variable   -> kept
    0.2, NA,  0.8, # non-finite -> dropped (require_finite)
    Inf, 0.3, 0.4 # non-finite -> dropped
  ), nrow = 4, byrow = TRUE, dimnames = list(c("c", "v", "na", "inf"), NULL))
  out <- drop_invariant_probes(m, min_sd = 1e-5, require_finite = TRUE)
  expect_equal(rownames(out), "v")
})

test_that("drop_invariant_probes never collapses to a vector (drop = FALSE)", {
  m <- matrix(c(0.1, 0.9, 0.5, 0.5, 0.5, 0.5), nrow = 2, byrow = TRUE)
  out <- drop_invariant_probes(m)
  expect_true(is.matrix(out))
  expect_equal(nrow(out), 1L)
})

# ── impute_row_means() ────────────────────────────────────────────────────────

test_that("impute_row_means fills NAs with the row mean and drops all-NA rows", {
  m <- matrix(c(
    0.2, NA, 0.4, # NA -> mean(0.2,0.4) = 0.3
    NA,  NA, NA # all NA -> dropped
  ), nrow = 2, byrow = TRUE, dimnames = list(c("a", "allna"), NULL))
  out <- impute_row_means(m)
  expect_equal(rownames(out), "a")
  expect_false(anyNA(out))
  expect_equal(as.numeric(out["a", 2]), mean(c(0.2, 0.4))) # NA -> row mean
})

test_that("impute_row_means leaves a complete matrix unchanged", {
  m <- matrix(c(0.1, 0.2, 0.3, 0.4), nrow = 2)
  expect_equal(impute_row_means(m), m)
})

# ── load_beta_matrix() ────────────────────────────────────────────────────────

test_that("load_beta_matrix reads a valid RDS matrix", {
  f <- tempfile(fileext = ".rds")
  on.exit(unlink(f))
  m <- matrix(runif(6), nrow = 2, dimnames = list(c("cg1", "cg2"), c("s1", "s2", "s3")))
  saveRDS(m, f)
  out <- load_beta_matrix(f)
  expect_true(is.matrix(out))
  expect_equal(dim(out), c(2L, 3L))
})

test_that("load_beta_matrix aborts on a missing file", {
  expect_fatal(load_beta_matrix("/does/not/exist.rds"), "not found")
})

test_that("load_beta_matrix aborts on a corrupted RDS", {
  f <- tempfile(fileext = ".rds")
  on.exit(unlink(f))
  writeLines("not an rds", f)
  expect_fatal(load_beta_matrix(f), "read")
})

test_that("load_beta_matrix aborts on an empty matrix", {
  f <- tempfile(fileext = ".rds")
  on.exit(unlink(f))
  saveRDS(matrix(numeric(0), nrow = 0, ncol = 0), f)
  expect_fatal(load_beta_matrix(f), "empty")
})

# ── restrict_to_passed_probes() ───────────────────────────────────────────────

.beta_fixture <- function(ids) {
  matrix(
    seq_len(length(ids) * 2L), nrow = length(ids),
    dimnames = list(ids, c("s1", "s2"))
  )
}

test_that("restrict_to_passed_probes returns the matrix unchanged when no selection file exists", {
  d <- tempfile()
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  m <- .beta_fixture(c("cg1", "cg2", "cg3"))
  expect_identical(restrict_to_passed_probes(m, d), m)
})

test_that("restrict_to_passed_probes keeps only the allowlisted probes, preserving row order and columns", {
  d <- tempfile()
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  m <- .beta_fixture(c("cg1", "cg2", "cg3", "cg4"))
  saveRDS(c("cg2", "cg4"), file.path(d, "passed_probes.rds"))
  out <- restrict_to_passed_probes(m, d)
  expect_equal(rownames(out), c("cg2", "cg4")) # subset in the matrix's original order
  expect_equal(colnames(out), colnames(m)) # columns untouched
  expect_equal(out["cg2", ], m["cg2", ]) # values untouched
  expect_true(is.matrix(out)) # never collapses to a vector
})

test_that("restrict_to_passed_probes intersects — allowlist ids absent from the matrix are ignored", {
  d <- tempfile()
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  m <- .beta_fixture(c("cg1", "cg2"))
  saveRDS(c("cg2", "cg99"), file.path(d, "passed_probes.rds")) # cg99 not in the matrix
  expect_equal(rownames(restrict_to_passed_probes(m, d)), "cg2")
})

test_that("restrict_to_passed_probes leaves the matrix unchanged (with a warning) on an empty overlap", {
  d <- tempfile()
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  m <- .beta_fixture(c("cg1", "cg2"))
  saveRDS(c("other1", "other2"), file.path(d, "passed_probes.rds"))
  expect_warning(out <- restrict_to_passed_probes(m, d), "no probe id")
  expect_identical(out, m)
})

test_that("restrict_to_passed_probes tolerates an empty or unreadable selection", {
  d <- tempfile()
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  m <- .beta_fixture(c("cg1", "cg2"))

  saveRDS(character(0), file.path(d, "passed_probes.rds")) # empty selection -> no filtering
  expect_identical(restrict_to_passed_probes(m, d), m)

  writeLines("not an rds", file.path(d, "passed_probes.rds")) # corrupt -> never aborts
  expect_identical(restrict_to_passed_probes(m, d), m)
})
