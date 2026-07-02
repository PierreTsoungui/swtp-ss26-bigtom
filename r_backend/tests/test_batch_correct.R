# =============================================================================
# TEST SUITE: batch_correct.R
#
# CONTRACT UNDER TEST
#   CLI:  Rscript batch_correct.R <job_dir> <batch_vars> [<covariates>]
#   Removes technical batch effects from <job_dir>/normalized_data.rds with
#   limma::removeBatchEffect, PRESERVING the biological covariates via the design
#   matrix, and writes <job_dir>/corrected_data.rds (a plain numeric matrix).
#   Batch var -> batch; 2nd -> batch2; 3rd+ -> covariates (dummy contrasts);
#   covariates -> design (preserved).
#
# APPROACH
#   batch_correct.R already guards its CLI block (`is_main_script`), so sourcing
#   the file only defines its functions. We then replace the emit_* emitters with
#   test doubles (emit_error -> catchable condition) and drive both the pure
#   helpers and the full run_batch_correction() in-process on small synthetic
#   jobs — fast, deterministic, and independent of any external fixture.
#
# DESIGN NOTE
#   batch_correct.R is GENERALIZED and has NO biological guardrail (unlike the
#   API layer): ANY column may be passed as a batch variable. If a biological
#   column is (mis)used as a batch variable, its signal WILL be removed. Two
#   tests below lock in both the correct use (biological signal preserved via the
#   design) and this documented misuse behaviour.
# =============================================================================

library(testthat)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH <- "/app/r_backend/batch_correct.R"


# ══════════════════════════════════════════════════════════════════════════════
# Setup: source functions (CLI is self-guarded) + emit_* test doubles
# ══════════════════════════════════════════════════════════════════════════════

bc_loaded <- tryCatch({
  suppressWarnings(suppressMessages(source(SCRIPT_PATH)))   # is_main_script == FALSE here
  assign("emit_error", function(message) {
    stop(structure(class = c("bc_fatal", "error", "condition"),
                   list(message = as.character(message), call = NULL)))
  }, envir = globalenv())
  assign("emit_progress", function(percent, message) invisible(NULL), envir = globalenv())
  assign("emit_done",     function(...) invisible(NULL),               envir = globalenv())
  exists("validate_batch_vars") && exists("run_batch_correction")
}, error = function(e) FALSE)

skip_if_not_loaded <- function() {
  skip_if_not(isTRUE(bc_loaded),
              paste("batch_correct.R could not be sourced (run in the r_worker container):", SCRIPT_PATH))
}

#' Assert `expr` triggers a fatal emit_error() (optionally matching `regexp`).
expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch({ force(expr); NULL }, bc_fatal = function(c) c)
  expect_false(is.null(cnd), info = "expected a fatal emit_error() but none was raised")
  if (!is.null(regexp) && !is.null(cnd)) expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
  invisible(cnd)
}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS — pure helpers
# ══════════════════════════════════════════════════════════════════════════════

# ── sanitize_model_column() ───────────────────────────────────────────────────

test_that("sanitize_model_column mean-imputes numeric NAs and keeps length", {
  skip_if_not_loaded()
  out <- sanitize_model_column(c(1, NA, 3, NA))
  expect_true(is.numeric(out))
  expect_false(anyNA(out))
  expect_equal(out[2], mean(c(1, 3)))          # imputed with the column mean
  expect_length(out, 4L)
})

test_that("sanitize_model_column turns character NAs/blanks into an explicit 'NA' factor level", {
  skip_if_not_loaded()
  out <- sanitize_model_column(c("A", NA, "", "B"))
  expect_s3_class(out, "factor")
  expect_length(out, 4L)
  expect_true("NA" %in% levels(out))            # missing/blank collapsed to one level
  expect_equal(as.character(out)[c(2, 3)], c("NA", "NA"))
})

# ── validate_covariates(targets, covariates_str, n_samples) ───────────────────

test_that("validate_covariates keeps a valid multi-level categorical covariate", {
  skip_if_not_loaded()
  tg <- data.frame(Sample_Group = c("Case", "Ctrl", "Case", "Ctrl"), stringsAsFactors = FALSE)
  expect_equal(validate_covariates(tg, "Sample_Group", n_samples = 4L), "Sample_Group")
})

test_that("validate_covariates keeps a numeric covariate with variance", {
  skip_if_not_loaded()
  tg <- data.frame(Age = c(30, 40, 50, 60), stringsAsFactors = FALSE)   # 4 distinct == n
  # Numeric id-like columns are allowed (only categoricals are dropped at n==levels).
  expect_equal(validate_covariates(tg, "Age", n_samples = 4L), "Age")
})

test_that("validate_covariates drops single-level, id-like, missing and empty inputs", {
  skip_if_not_loaded()
  tg <- data.frame(
    Const = c("x", "x", "x", "x"),                 # single level
    PerSample = c("a", "b", "c", "d"),             # one level per sample (id-like)
    NumConst = c(5, 5, 5, 5),                       # numeric, no variance
    stringsAsFactors = FALSE
  )
  expect_length(validate_covariates(tg, "Const",       n_samples = 4L), 0L)
  expect_length(validate_covariates(tg, "PerSample",   n_samples = 4L), 0L)
  expect_length(validate_covariates(tg, "NumConst",    n_samples = 4L), 0L)
  expect_length(validate_covariates(tg, "DoesNotExist", n_samples = 4L), 0L)
  expect_length(validate_covariates(tg, "",            n_samples = 4L), 0L)
  expect_length(validate_covariates(tg, NA,            n_samples = 4L), 0L)
})

test_that("validate_covariates parses a comma-separated list and keeps only valid ones", {
  skip_if_not_loaded()
  tg <- data.frame(Sample_Group = c("Case", "Ctrl", "Case", "Ctrl"),
                   Const = c("x", "x", "x", "x"), stringsAsFactors = FALSE)
  expect_equal(validate_covariates(tg, "Sample_Group, Const, Missing", n_samples = 4L), "Sample_Group")
})

# ── validate_batch_vars(targets, batch_vars, n_samples) ───────────────────────

test_that("validate_batch_vars keeps a valid multi-level batch variable", {
  skip_if_not_loaded()
  tg <- data.frame(Batch = c("B1", "B2", "B1", "B2"), stringsAsFactors = FALSE)
  expect_equal(validate_batch_vars(tg, "Batch", n_samples = 4L), "Batch")
})

test_that("validate_batch_vars drops single-level, fully-confounded and missing variables", {
  skip_if_not_loaded()
  tg <- data.frame(
    Batch  = c("B1", "B2", "B1", "B2"),
    Single = c("X", "X", "X", "X"),                # one level
    PerSmp = c("a", "b", "c", "d"),                # one level per sample (confounded)
    stringsAsFactors = FALSE
  )
  expect_length(validate_batch_vars(tg, "Single", n_samples = 4L), 0L)
  expect_length(validate_batch_vars(tg, "PerSmp", n_samples = 4L), 0L)
  expect_length(validate_batch_vars(tg, "Missing", n_samples = 4L), 0L)
  # A mix keeps only the valid one.
  expect_equal(validate_batch_vars(tg, c("Batch", "Single", "Missing"), n_samples = 4L), "Batch")
})

# ── build_design() ────────────────────────────────────────────────────────────

test_that("build_design returns an intercept-only design when no covariates are given", {
  skip_if_not_loaded()
  tg <- data.frame(Sample_Group = c("Case", "Ctrl", "Case", "Ctrl"), stringsAsFactors = FALSE)
  d <- build_design(tg, character(0))
  expect_equal(ncol(d), 1L)                       # intercept only
  expect_equal(nrow(d), 4L)
})

test_that("build_design encodes the covariate (intercept + contrast columns)", {
  skip_if_not_loaded()
  tg <- data.frame(Sample_Group = c("Case", "Ctrl", "Case", "Ctrl"), stringsAsFactors = FALSE)
  d <- build_design(tg, "Sample_Group")
  expect_equal(nrow(d), 4L)
  expect_equal(ncol(d), 2L)                       # intercept + 1 contrast (2 levels)
  expect_true(qr(d)$rank == 2L)                   # full column rank
})

# ── build_extra_batch_covariates() ────────────────────────────────────────────

test_that("build_extra_batch_covariates returns NULL when there are no extra vars", {
  skip_if_not_loaded()
  tg <- data.frame(B = c("a", "b"), stringsAsFactors = FALSE)
  expect_null(build_extra_batch_covariates(tg, character(0)))
})

test_that("build_extra_batch_covariates emits (k-1) contrast columns per factor", {
  skip_if_not_loaded()
  tg <- data.frame(
    Two   = c("a", "b", "a", "b"),                 # 2 levels -> 1 column
    Three = c("x", "y", "z", "x"),                 # 3 levels -> 2 columns
    stringsAsFactors = FALSE
  )
  m1 <- build_extra_batch_covariates(tg, "Two")
  expect_equal(ncol(m1), 1L); expect_equal(nrow(m1), 4L)

  m2 <- build_extra_batch_covariates(tg, c("Two", "Three"))
  expect_equal(ncol(m2), 1L + 2L)                 # cbind of 1 + 2 contrast columns
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS — run_batch_correction() in-process on synthetic jobs
# ══════════════════════════════════════════════════════════════════════════════

#' Build a self-contained job directory with a synthetic beta matrix + sheet.
#'
#' Column names follow Illumina "<Sentrix_ID>_<Sentrix_Position>" so alignment
#' matches by id. A biological group effect and an (orthogonal) batch effect can
#' be injected to test signal preservation vs. removal.
#'
#' @param n Number of samples (even).
#' @param n_probes Number of probes.
#' @param group,batch Optional explicit group/batch vectors (length n).
#' @param group_effect,batch_effect Additive per-column shifts.
#' @param extra Optional named list of additional sample-sheet columns.
#' @return list(dir, mat, pd, coln, group, batch).
make_job_dir <- function(n = 8L, n_probes = 100L, group = NULL, batch = NULL,
                         group_effect = 0, batch_effect = 0, extra = NULL, seed = 42L) {
  tmp <- tempfile("job_bc_"); dir.create(tmp)
  set.seed(seed)

  ids  <- as.character(206891110000 + seq_len(n))
  pos  <- rep(c("R01C01", "R02C01", "R03C01", "R04C01"), length.out = n)
  coln <- paste0(ids, "_", pos)
  group <- group %||% rep(c("Case", "Ctrl"), each = n %/% 2L)
  batch <- batch %||% rep(c("B1", "B2"),   times = n %/% 2L)

  mat <- matrix(runif(n_probes * n, 0.3, 0.7), nrow = n_probes,
                dimnames = list(paste0("cg", seq_len(n_probes)), coln))
  # Additive, probe-constant shifts (column-major fill => per-column offsets).
  mat <- mat + matrix(rep((group == "Case") * group_effect, each = n_probes), nrow = n_probes)
  mat <- mat + matrix(rep((batch == "B2")   * batch_effect, each = n_probes), nrow = n_probes)
  saveRDS(mat, file.path(tmp, "normalized_data.rds"))

  pd <- data.frame(
    Sample_Name = paste0("S", seq_len(n)), Sample_Group = group,
    Sentrix_ID = ids, Sentrix_Position = pos, Batch = batch,
    stringsAsFactors = FALSE
  )
  if (!is.null(extra)) for (nm in names(extra)) pd[[nm]] <- extra[[nm]]

  ss <- file.path(tmp, "SampleSheet.csv")
  writeLines(c("[Header]", "Investigator Name,Test", "", "[Data]"), ss)
  suppressWarnings(write.table(pd, ss, sep = ",", row.names = FALSE, quote = FALSE, append = TRUE))

  list(dir = tmp, mat = mat, pd = pd, coln = coln, group = group, batch = batch)
}

#' Run run_batch_correction() and capture success/error (emit_error -> stop()).
run_correction <- function(job_dir, batch_vars, covariates = "") {
  tryCatch({
    run_batch_correction(job_dir, batch_vars, covariates)
    list(success = TRUE, error = NULL)
  }, bc_fatal = function(e) list(success = FALSE, error = conditionMessage(e)),
     error     = function(e) list(success = FALSE, error = conditionMessage(e)))
}

# ── Happy path & output integrity ─────────────────────────────────────────────

test_that("a single batch variable yields a corrected matrix of identical shape", {
  skip_if_not_loaded()
  job <- make_job_dir(); on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)
  res <- run_correction(job$dir, "Batch", "Sample_Group")
  expect_true(res$success, info = res$error)

  out <- file.path(job$dir, "corrected_data.rds")
  expect_true(file.exists(out))
  corrected <- readRDS(out)
  expect_true(is.matrix(corrected))
  expect_equal(dim(corrected), dim(job$mat))
  expect_setequal(rownames(corrected), rownames(job$mat))
  expect_setequal(colnames(corrected), colnames(job$mat))
  expect_false(anyNA(corrected))
  expect_false(any(is.infinite(corrected)))
})

test_that("two batch variables (batch + batch2) succeed", {
  skip_if_not_loaded()
  job <- make_job_dir(extra = list(Batch2 = rep(c("P", "Q"), times = 4L)))
  on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)
  res <- suppressWarnings(run_correction(job$dir, "Batch,Batch2", "Sample_Group"))
  expect_true(res$success, info = res$error)
  expect_true(file.exists(file.path(job$dir, "corrected_data.rds")))
})

test_that("three batch variables exercise the extra-covariates path and succeed", {
  # The 3rd batch variable is removed via removeBatchEffect's `covariates` arg
  # (dummy contrasts), not batch/batch2 — the key correctness path.
  skip_if_not_loaded()
  job <- make_job_dir(extra = list(
    Batch2 = rep(c("P", "Q"), times = 4L),
    Batch3 = rep(c("m", "n"), each = 4L)
  ))
  on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)
  res <- suppressWarnings(run_correction(job$dir, "Batch,Batch2,Batch3", "Sample_Group"))
  expect_true(res$success, info = res$error)
  expect_true(file.exists(file.path(job$dir, "corrected_data.rds")))
})

# ── Biological correctness ────────────────────────────────────────────────────

test_that("the protected biological signal is preserved while the batch effect is removed", {
  # Orthogonal design: group (Case/Ctrl) and batch (B1/B2) vary independently.
  # Correcting Batch while protecting Sample_Group must KEEP the group difference
  # and REMOVE the batch difference.
  skip_if_not_loaded()
  group <- c("Case", "Case", "Case", "Case", "Ctrl", "Ctrl", "Ctrl", "Ctrl")
  batch <- c("B1", "B1", "B2", "B2", "B1", "B1", "B2", "B2")
  job <- make_job_dir(group = group, batch = batch, group_effect = 0.20, batch_effect = 0.15)
  on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)

  res <- run_correction(job$dir, "Batch", "Sample_Group")
  expect_true(res$success, info = res$error)
  corrected <- readRDS(file.path(job$dir, "corrected_data.rds"))

  gmean <- function(m, g) mean(m[, job$group == g])
  bmean <- function(m, b) mean(m[, job$batch == b])

  group_before <- abs(gmean(job$mat, "Case") - gmean(job$mat, "Ctrl"))
  group_after  <- abs(gmean(corrected, "Case") - gmean(corrected, "Ctrl"))
  batch_before <- abs(bmean(job$mat, "B1") - bmean(job$mat, "B2"))
  batch_after  <- abs(bmean(corrected, "B1") - bmean(corrected, "B2"))

  # Biological group difference preserved (design), batch difference collapsed.
  expect_lt(abs(group_after - group_before), 0.02)
  expect_lt(batch_after, batch_before * 0.25)
})

test_that("using a biological column as a batch variable removes its signal (no guardrail)", {
  # Documents the intentional absence of a biological guard in batch_correct.R:
  # if Sample_Group is (mis)used as a batch variable, its signal is removed.
  skip_if_not_loaded()
  job <- make_job_dir(group_effect = 0.30)
  on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)

  res <- run_correction(job$dir, "Sample_Group", covariates = "")
  expect_true(res$success, info = res$error)
  corrected <- readRDS(file.path(job$dir, "corrected_data.rds"))

  gmean <- function(m, g) mean(m[, job$group == g])
  before <- abs(gmean(job$mat, "Case") - gmean(job$mat, "Ctrl"))
  after  <- abs(gmean(corrected, "Case") - gmean(corrected, "Ctrl"))
  expect_lt(after, before)                         # signal removed as if technical
})

# ── Error handling ────────────────────────────────────────────────────────────

test_that("a missing normalized_data.rds is rejected", {
  skip_if_not_loaded()
  tmp <- tempfile("job_bc_nofile_"); dir.create(tmp); on.exit(unlink(tmp, recursive = TRUE))
  ss <- file.path(tmp, "SampleSheet.csv")
  writeLines(c("[Header]", "", "[Data]"), ss)
  suppressWarnings(write.table(
    data.frame(Sample_Name = "S1", Sentrix_ID = "206891110001",
               Sentrix_Position = "R01C01", Batch = "B1"),
    ss, sep = ",", row.names = FALSE, quote = FALSE, append = TRUE))
  res <- run_correction(tmp, "Batch")
  expect_false(res$success)
  expect_match(res$error, "normalized_data", ignore.case = TRUE)
})

test_that("a missing sample sheet is rejected", {
  skip_if_not_loaded()
  tmp <- tempfile("job_bc_nosheet_"); dir.create(tmp); on.exit(unlink(tmp, recursive = TRUE))
  saveRDS(matrix(runif(50L), nrow = 10L), file.path(tmp, "normalized_data.rds"))
  res <- run_correction(tmp, "Batch")
  expect_false(res$success)
  expect_match(res$error, "sample sheet", ignore.case = TRUE)
})

test_that("an empty batch_vars argument is rejected", {
  skip_if_not_loaded()
  job <- make_job_dir(); on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)
  res <- run_correction(job$dir, "")
  expect_false(res$success)
  expect_match(res$error, "batch", ignore.case = TRUE)
})

test_that("all-invalid batch variables FAIL LOUDLY (no silent pass-through)", {
  # Current, deliberate behaviour: if every requested batch variable is dropped
  # by validation, the script aborts (it does NOT write an uncorrected matrix and
  # report success). This locks that contract in.
  skip_if_not_loaded()
  job <- make_job_dir(); on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)
  res <- run_correction(job$dir, "NonExistentBatch", "Sample_Group")
  expect_false(res$success)
  expect_match(res$error, "No valid batch variables", ignore.case = TRUE)
  expect_false(file.exists(file.path(job$dir, "corrected_data.rds")))
})

test_that("a corrupted normalized_data.rds is rejected cleanly", {
  # Coverage gap: only the MISSING file was tested; an unreadable/corrupted RDS
  # must be caught by the readRDS tryCatch, not crash the interpreter.
  skip_if_not_loaded()
  job <- make_job_dir(); on.exit(unlink(job$dir, recursive = TRUE), add = TRUE)
  writeLines("this is not a valid rds", file.path(job$dir, "normalized_data.rds"))  # overwrite
  res <- run_correction(job$dir, "Batch", "Sample_Group")
  expect_false(res$success)
  expect_match(res$error, "read|corrupt", ignore.case = TRUE)
})
