# =============================================================================
# TEST SUITE: batch_svd.R
#
# CONTRACT UNDER TEST
#   CLI:  Rscript batch_svd.R <beta_path> <sample_sheet_path> <job_dir> [<png_name>]
#   Computes PCA on the (top-variance) beta matrix and tests every sample-sheet
#   GROUPING column against each principal component (Kruskal-Wallis), then
#   renders a <png_name> heatmap + the matching .pdf. Progress/errors are
#   single-line JSON on stdout; success ends with {"type":"done"}.
#
# IMPORTANT — DESIGN NOTE
#   The current batch_svd.R is GENERALIZED: it has NO technical/biological
#   whitelist and does NOT exclude Sample_Group. Every column that groups the
#   samples (>=2 and < n_samples distinct values) becomes a row — biological
#   columns included. Earlier tests asserted a whitelist / a "Sample_Group is
#   protected" guardrail; that behaviour no longer exists, so those assertions
#   are intentionally replaced here with tests of the actual generalized logic.
#
# TWO LAYERS
#   1. UNIT — source the script (pipeline guarded by `sys.nframe()==0L`, so only
#      the functions load) and test each pure helper across all branches.
#   2. INTEGRATION — run the real script via Rscript on a beta.rds + matching
#      SampleSheet.csv fixture discovered under /app/jobs.
#
# Everything skips (never fails) when the script or a fixture is unavailable.
# =============================================================================

library(testthat)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH <- "/app/r_backend/batch_svd.R"


# ══════════════════════════════════════════════════════════════════════════════
# Setup: source functions + catchable emit_error() double
# ══════════════════════════════════════════════════════════════════════════════

svd_loaded <- tryCatch(
  {
    suppressWarnings(suppressMessages(source(SCRIPT_PATH)))
    assign("emit_error", function(message) {
      stop(structure(
        class = c("svd_fatal", "error", "condition"),
        list(message = as.character(message), call = NULL)
      ))
    }, envir = globalenv())
    exists("compute_principal_components") && exists("select_grouping_variables")
  },
  error = function(e) FALSE
)

skip_if_not_loaded <- function() {
  skip_if_not(
    isTRUE(svd_loaded),
    paste("batch_svd.R could not be sourced (run in the r_worker container):", SCRIPT_PATH)
  )
}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── compute_principal_components() ────────────────────────────────────────────

test_that("compute_principal_components returns PCs with the right shape", {
  skip_if_not_loaded()
  set.seed(1)
  beta <- matrix(runif(100 * 4), nrow = 100, ncol = 4, dimnames = list(NULL, paste0("S", 1:4)))
  res <- compute_principal_components(beta)

  expect_equal(nrow(res$pcs), 4L) # one row per sample
  expect_equal(res$n_pcs, min(10L, 4L)) # n_pcs = min(MAX_PCS, #components)
  expect_equal(ncol(res$pcs), res$n_pcs)
  expect_length(res$var_explained, res$n_pcs)
  expect_true(all(res$var_explained >= 0 & res$var_explained <= 100))
})

test_that("compute_principal_components caps the number of PCs at MAX_PCS (10)", {
  skip_if_not_loaded()
  set.seed(2)
  beta <- matrix(runif(200 * 15), nrow = 200, ncol = 15, dimnames = list(NULL, paste0("S", 1:15)))
  res <- compute_principal_components(beta)
  expect_equal(res$n_pcs, 10L) # min(MAX_PCS=10, 15 components)
  expect_equal(ncol(res$pcs), 10L)
})

test_that("compute_principal_components subsamples matrices above MAX_PROBES_FOR_PCA", {
  # > 50000 probes: the function keeps only the top-variance rows before PCA.
  # We can only observe the (unchanged) sample dimension, but the run must stay
  # correct and finite.
  skip_if_not_loaded()
  set.seed(3)
  beta <- matrix(runif((MAX_PROBES_FOR_PCA + 1000L) * 4), ncol = 4, dimnames = list(NULL, paste0("S", 1:4)))
  res <- compute_principal_components(beta)
  expect_equal(nrow(res$pcs), 4L)
  expect_true(all(is.finite(res$pcs)))
})

# ── select_grouping_variables() ───────────────────────────────────────────────

test_that("select_grouping_variables keeps grouping columns and drops the rest", {
  # Generalized behaviour: a biological column (Sample_Group) IS a grouping
  # variable; constants, per-sample-unique ids and Array_ID are excluded.
  skip_if_not_loaded()
  df <- data.frame(
    Array_ID = c("a1", "a2", "a3", "a4"), # always excluded
    Sample_Group = c("A", "A", "B", "B"), # 2 distinct  -> kept
    Batch = c("b1", "b1", "b2", "b2"), # 2 distinct  -> kept
    Constant = c("x", "x", "x", "x"), # 1 distinct  -> dropped
    Unique = c("u1", "u2", "u3", "u4"), # 4 == n      -> dropped
    MostlyEmpty = c("p", "p", NA, ""), # 1 non-empty -> dropped
    stringsAsFactors = FALSE
  )
  sgv <- select_grouping_variables(df, n_samples = 4L)

  expect_setequal(names(sgv), c("Sample_Group", "Batch"))
  expect_false("Array_ID" %in% names(sgv))
  expect_true(is.integer(sgv$Sample_Group))
})

test_that("select_grouping_variables returns an empty list when nothing groups", {
  skip_if_not_loaded()
  df <- data.frame(
    Array_ID = c("a1", "a2", "a3"),
    AllSame = c("z", "z", "z"),
    AllUniq = c("u1", "u2", "u3"), stringsAsFactors = FALSE
  )
  expect_length(select_grouping_variables(df, n_samples = 3L), 0L)
})

# ── association_pvalue() ──────────────────────────────────────────────────────

test_that("association_pvalue returns NA for a single-level grouping", {
  skip_if_not_loaded()
  expect_true(is.na(association_pvalue(rep("A", 8), rnorm(8))))
})

test_that("association_pvalue returns a p-value in [0,1] for a real two-group split", {
  skip_if_not_loaded()
  set.seed(10)
  groups <- rep(c("A", "B"), each = 6)
  scores <- c(rnorm(6, 0), rnorm(6, 5)) # clearly separated
  p <- association_pvalue(groups, scores)
  expect_false(is.na(p))
  expect_gte(p, 0)
  expect_lte(p, 1)
})

test_that("association_pvalue returns NA on an internal error", {
  # Mismatched lengths make kruskal.test() error; the helper must swallow it.
  skip_if_not_loaded()
  expect_true(is.na(association_pvalue(rep(c("A", "B"), each = 3), rnorm(4))))
})

# ── compute_pvalue_matrix() ───────────────────────────────────────────────────

test_that("compute_pvalue_matrix builds a variable x PC matrix", {
  skip_if_not_loaded()
  set.seed(11)
  pcs <- matrix(rnorm(6 * 3), nrow = 6, ncol = 3) # 6 samples x 3 PCs
  vf <- list(
    Group = as.integer(factor(rep(c("A", "B"), each = 3))),
    Batch = as.integer(factor(rep(c("x", "y"), times = 3)))
  )
  m <- compute_pvalue_matrix(vf, pcs, n_pcs = 3L)

  expect_equal(dim(m), c(2L, 3L))
  expect_setequal(rownames(m), c("Group", "Batch"))
  vals <- m[!is.na(m)]
  expect_true(all(vals >= 0 & vals <= 1))
})

test_that("compute_pvalue_matrix returns a placeholder row when nothing groups", {
  skip_if_not_loaded()
  pcs <- matrix(rnorm(4 * 2), nrow = 4, ncol = 2)
  m <- compute_pvalue_matrix(list(), pcs, n_pcs = 2L)
  expect_equal(dim(m), c(1L, 2L))
  expect_equal(rownames(m), "—") # em dash placeholder
  expect_true(all(is.na(m)))
})

# ── pvalue_to_color() ─────────────────────────────────────────────────────────

test_that("pvalue_to_color maps p-values to the correct bins", {
  skip_if_not_loaded()
  expect_equal(pvalue_to_color(NA), PVAL_NA_COLOR)
  expect_equal(pvalue_to_color(1e-11), PVAL_BIN_COLORS[1]) # p < 1e-10
  expect_equal(pvalue_to_color(1e-6), PVAL_BIN_COLORS[2]) # p < 1e-5
  expect_equal(pvalue_to_color(5e-3), PVAL_BIN_COLORS[3]) # p < 0.01
  expect_equal(pvalue_to_color(0.03), PVAL_BIN_COLORS[4]) # p < 0.05
  expect_equal(pvalue_to_color(0.5), PVAL_BIN_COLORS[5]) # p >= 0.05
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS (real subprocess + discovered fixture)
# ══════════════════════════════════════════════════════════════════════════════

#' Discover the smallest beta.rds (matrix) with a matching, clean SampleSheet.
#'
#' Requires the sibling SampleSheet.csv to carry Sentrix columns with UNIQUE
#' Array_IDs (so intersect-alignment does not reject duplicates) and >= 3 rows.
#'
#' @return list(beta, sheet) or NULL.
discover_svd_fixture <- function() {
  cand <- list()
  for (d in list.dirs("/app/jobs", recursive = FALSE)) {
    beta <- file.path(d, "beta.rds")
    sh <- file.path(d, "SampleSheet.csv")
    if (!file.exists(beta) || !file.exists(sh)) next
    ln <- tryCatch(readLines(sh, warn = FALSE), error = function(e) character(0))
    ds <- grep("^\\[Data\\]", ln)
    skip_n <- if (length(ds)) ds[1] else 0
    s <- tryCatch(read.csv(sh, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE),
      error = function(e) NULL
    )
    if (is.null(s) || !all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(s))) next
    aid <- paste0(s$Sentrix_ID, "_", s$Sentrix_Position)
    if (nrow(s) >= 3L && !anyDuplicated(aid)) {
      cand[[length(cand) + 1L]] <- list(beta = beta, sheet = sh, size = file.info(beta)$size)
    }
  }
  if (!length(cand)) {
    return(NULL)
  }
  cand[[which.min(vapply(cand, function(x) x$size, numeric(1)))]]
}

FIXTURE <- if (file.exists(SCRIPT_PATH)) discover_svd_fixture() else NULL

skip_if_no_fixture <- function() {
  skip_if_not(file.exists(SCRIPT_PATH), "batch_svd.R not found")
  skip_if(is.null(FIXTURE), "No beta.rds + clean SampleSheet.csv fixture under /app/jobs")
}

#' Run batch_svd.R as a subprocess.
#' @return list(status, lines, stdout, logs, job_dir, png_path, pdf_path).
run_svd <- function(beta = FIXTURE$beta, samples = FIXTURE$sheet,
                    job_dir = tempfile("svd_out_"), png_name = "svd_plot.png") {
  dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)
  out <- suppressWarnings(system2(
    "Rscript", c(shQuote(SCRIPT_PATH), shQuote(beta), shQuote(samples), shQuote(job_dir), shQuote(png_name)),
    stdout = TRUE, stderr = TRUE
  ))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(
    Negate(is.null),
    lapply(out, function(l) tryCatch(jsonlite::fromJSON(l), error = function(e) NULL))
  )
  list(
    status = as.integer(status), lines = out, stdout = paste(out, collapse = "\n"),
    logs = logs, job_dir = job_dir,
    png_path = file.path(job_dir, png_name),
    pdf_path = file.path(job_dir, sub("\\.png$", ".pdf", png_name))
  )
}

log_types <- function(res) unlist(lapply(res$logs, function(x) x$type %||% NULL))
log_messages <- function(res) unlist(lapply(res$logs, function(x) x$message %||% NULL))

# The happy run is reused across several assertions.
.svd_cache <- new.env(parent = emptyenv())
happy_run <- function() {
  if (is.null(.svd_cache$res)) .svd_cache$res <- run_svd()
  .svd_cache$res
}

# ── Happy path ────────────────────────────────────────────────────────────────

test_that("a standard run exits 0, emits 'done', and writes a PNG + PDF", {
  skip_if_no_fixture()
  res <- happy_run()

  expect_equal(res$status, 0L, info = res$stdout)
  expect_true("done" %in% log_types(res), info = "missing final 'done' signal")
  expect_false("error" %in% log_types(res), info = "an error was emitted on a successful run")

  expect_true(file.exists(res$png_path), info = "SVD PNG not created")
  expect_gt(file.size(res$png_path), 5000L) # a real plot, not a blank canvas
  expect_true(file.exists(res$pdf_path), info = "SVD PDF not created")
})

test_that("a custom png_name is honoured (and the default is not created)", {
  skip_if_no_fixture()
  res <- run_svd(png_name = "my_svd_analysis.png")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)

  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(res$job_dir, "my_svd_analysis.png")))
  expect_true(file.exists(file.path(res$job_dir, "my_svd_analysis.pdf"))) # derived name
  expect_false(file.exists(file.path(res$job_dir, "svd_plot.png")))
})

# ── Robustness ────────────────────────────────────────────────────────────────

test_that("missing arguments are rejected with a usage error", {
  skip_if_not(file.exists(SCRIPT_PATH), "script not found")
  out <- suppressWarnings(system2("Rscript", shQuote(SCRIPT_PATH), stdout = TRUE, stderr = TRUE))
  code <- attr(out, "status") %||% 0L
  expect_true(code != 0L)
  expect_match(paste(out, collapse = "\n"), "Insufficient arguments")
})

test_that("a missing beta matrix triggers a structured error and exit 1", {
  skip_if_no_fixture()
  res <- run_svd(beta = "/tmp/does_not_exist_beta.rds")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true("error" %in% log_types(res))
  expect_true(any(grepl("not found|beta", log_messages(res), ignore.case = TRUE)))
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("a missing sample sheet triggers a structured error and exit 1", {
  skip_if_no_fixture()
  res <- run_svd(samples = "/tmp/does_not_exist_sheet.csv")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true("error" %in% log_types(res))
  expect_true(any(grepl("not found", log_messages(res), ignore.case = TRUE)))
})

test_that("too few matching samples between beta and sheet is rejected", {
  # Keep only the first array's real Sentrix id; fake the rest so fewer than the
  # required 2 samples align -> the intersect step emits a clear error.
  skip_if_no_fixture()
  ln <- readLines(FIXTURE$sheet, warn = FALSE)
  ds <- grep("^\\[Data\\]", ln)
  skip_n <- if (length(ds)) ds[1] else 0
  s <- read.csv(FIXTURE$sheet, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE)
  if (nrow(s) >= 2L) s$Sentrix_Position[-1] <- "R99C99" # break all but the first
  bad <- tempfile(fileext = ".csv")
  write.csv(s, bad, row.names = FALSE)
  on.exit(unlink(bad), add = TRUE)

  res <- run_svd(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true("error" %in% log_types(res))
  expect_true(any(grepl("match|mismatch|common|minimum|align", log_messages(res), ignore.case = TRUE)))
})

test_that("SVD still renders when no sample-sheet column groups the samples (n_vars = 0)", {
  # Coverage gap: the "No grouping variables found" render path. With every column
  # either constant (Sample_Group) or one-per-sample (Sample_Name), no variable
  # qualifies; the script must still succeed and draw the placeholder heatmap.
  skip_if_not(file.exists(SCRIPT_PATH), "batch_svd.R not found")
  jd <- tempfile("svd_novars_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE), add = TRUE)
  beta <- matrix(runif(200 * 4),
    nrow = 200,
    dimnames = list(paste0("cg", 1:200), paste0("s", 1:4))
  )
  brds <- file.path(jd, "beta.rds")
  saveRDS(beta, brds)
  sheet <- file.path(jd, "sheet.csv")
  write.csv(data.frame(
    Sample_Name = paste0("s", 1:4), Sample_Group = "OneGroup",
    stringsAsFactors = FALSE
  ), sheet, row.names = FALSE)

  res <- run_svd(beta = brds, samples = sheet, job_dir = jd)
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true("done" %in% log_types(res))
  expect_true(file.exists(file.path(jd, "svd_plot.png")))
})
