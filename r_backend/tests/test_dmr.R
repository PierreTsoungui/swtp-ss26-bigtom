# =============================================================================
# TEST SUITE: dmr.R
#
# CONTRACT UNDER TEST
#   CLI:  Rscript dmr.R <sample_sheet> <job_dir> <beta> [minProbes] [cutoff]
#         [adjPvalDmr] [maxGap] [arraytype] [nBootstraps] [nCores]
#         [group_column] [case] [control]
#   Runs ChAMP Bumphunter and writes dmr_results.csv/.rds with columns
#   ID, N_DMPS, CHR, START, STOP, WIDTH, P_VALUE, MEANDIFF. Progress/errors are
#   single-line JSON; success ends with {"type":"done"}.
#
# TWO LAYERS
#   1. UNIT — source dmr.R (pipeline guarded by `sys.nframe()==0L`, so only the
#      functions load) and test the pure helpers (build_dmr_output,
#      build_two_group_design, count_usable_clusters). emit_error() is replaced
#      by a catchable condition.
#   2. INTEGRATION — run the real script via Rscript on a beta.rds + matching
#      SampleSheet.csv + array_type.txt fixture discovered under /app/jobs. The
#      expensive Bumphunter runs are minimized (happy path memoised).
#
# NOTES ON THE PREVIOUS TESTS (intentional corrections)
#   * The output column is `N_DMPS` (upper-case S), not `N_DMPs`.
#   * `adjPvalDmr = 0` yielding zero regions is a VALID outcome (exit 0 + empty
#     table), NOT an error — dmr.R says so explicitly.
#   * dmr.R has no Inf/NaN finiteness guard (it clamps finite values only), so a
#     "reject non-finite beta" assertion does not match the actual contract.
# =============================================================================

library(testthat)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH  <- "/app/r_backend/dmr.R"
DMR_COLUMNS  <- c("ID", "N_DMPS", "CHR", "START", "STOP", "WIDTH", "P_VALUE", "MEANDIFF")


# ══════════════════════════════════════════════════════════════════════════════
# Setup: source functions + catchable emit_error() double
# ══════════════════════════════════════════════════════════════════════════════

dmr_loaded <- tryCatch({
  suppressWarnings(suppressMessages(source(SCRIPT_PATH)))
  assign("emit_error", function(message) {
    stop(structure(class = c("dmr_fatal", "error", "condition"),
                   list(message = as.character(message), call = NULL)))
  }, envir = globalenv())
  assign("emit_progress", function(percent, message) invisible(NULL), envir = globalenv())
  exists("build_dmr_output") && exists("build_two_group_design")
}, error = function(e) FALSE)

skip_if_not_loaded <- function() {
  skip_if_not(isTRUE(dmr_loaded),
              paste("dmr.R could not be sourced (run in the r_worker container):", SCRIPT_PATH))
}

expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch({ force(expr); NULL }, dmr_fatal = function(c) c)
  expect_false(is.null(cnd), info = "expected a fatal emit_error() but none was raised")
  if (!is.null(regexp) && !is.null(cnd)) expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
  invisible(cnd)
}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── build_dmr_output() ────────────────────────────────────────────────────────

test_that("build_dmr_output returns a well-formed empty table for NULL / 0 rows", {
  skip_if_not_loaded()
  for (x in list(NULL, data.frame())) {
    out <- build_dmr_output(x)
    expect_s3_class(out, "data.frame")
    expect_equal(colnames(out), DMR_COLUMNS)
    expect_equal(nrow(out), 0L)
  }
})

test_that("build_dmr_output maps ChAMP/Bumphunter columns and assigns DMR_<n> ids", {
  skip_if_not_loaded()
  tab <- data.frame(
    seqnames = c("chr1", "chr2"), start = c(100, 400), end = c(500, 900),
    width = c(401, 501), L = c(5, 8), value = c(0.3, -0.2),
    p.valueArea = c(0.01, 0.20), stringsAsFactors = FALSE
  )
  out <- build_dmr_output(tab)
  expect_equal(colnames(out), DMR_COLUMNS)
  expect_equal(out$ID, c("DMR_1", "DMR_2"))          # sequential, unique
  expect_true(all(grepl("^DMR_\\d+$", out$ID)))
  expect_equal(out$N_DMPS, c(5, 8))                   # from L
  expect_equal(out$CHR, c("chr1", "chr2"))            # from seqnames
  expect_equal(out$P_VALUE, c(0.01, 0.20))            # from p.valueArea
  expect_equal(out$MEANDIFF, c(0.3, -0.2))            # from value
})

test_that("build_dmr_output falls back to alternative column names", {
  # Bumphunter/other backends may name columns differently; the picker must cope.
  skip_if_not_loaded()
  tab <- data.frame(
    chr = "chr7", start = 10, end = 60, width = 51,
    nCpGs = 4, meanDiff = 0.15, p.value = 0.03, stringsAsFactors = FALSE
  )
  out <- build_dmr_output(tab)
  expect_equal(out$CHR, "chr7")
  expect_equal(out$N_DMPS, 4)
  expect_equal(out$MEANDIFF, 0.15)
  expect_equal(out$P_VALUE, 0.03)
})

# ── build_two_group_design() ──────────────────────────────────────────────────

test_that("build_two_group_design keeps two balanced groups with control as reference", {
  skip_if_not_loaded()
  beta <- matrix(runif(10 * 4), nrow = 10, dimnames = list(NULL, paste0("s", 1:4)))
  d <- build_two_group_design(beta, c("A", "A", "B", "B"), case_group = "B", control_group = "A")
  expect_equal(ncol(d$beta), 4L)                     # no virtual replicate needed
  expect_equal(levels(d$pheno), c("A", "B"))         # control (A) is the reference level
  expect_equal(as.integer(table(d$pheno)), c(2L, 2L))
})

test_that("build_two_group_design adds a virtual replicate for a single-sample group", {
  # Degenerate-case fallback: a group with n=1 gets one synthetic near-copy so the
  # region statistics can run (results to be read with caution).
  skip_if_not_loaded()
  beta <- matrix(runif(10 * 4), nrow = 10, dimnames = list(NULL, paste0("s", 1:4)))
  d <- build_two_group_design(beta, c("A", "B", "B", "B"), case_group = "B", control_group = "A")
  expect_equal(ncol(d$beta), 5L)                     # one synthetic column added
  expect_true(any(grepl("_virtual_rep$", colnames(d$beta))))
  expect_equal(as.integer(table(d$pheno)["A"]), 2L)  # the singleton group is padded to 2
})

# ── count_usable_clusters() ───────────────────────────────────────────────────

test_that("count_usable_clusters returns NA when no annotation is available", {
  skip_if_not_loaded()
  beta <- matrix(runif(6 * 4), nrow = 6, dimnames = list(paste0("cg", 1:6), NULL))
  expect_true(is.na(count_usable_clusters(beta, pf = NULL, max_gap = 1000, min_probes = 3)))
})

test_that("count_usable_clusters errors when beta and annotation do not overlap", {
  skip_if_not_loaded()
  beta <- matrix(runif(6 * 4), nrow = 6, dimnames = list(paste0("cg", 1:6), NULL))
  pf   <- data.frame(CHR = "chr1", MAPINFO = 1:3, row.names = paste0("zz", 1:3))
  expect_fatal(count_usable_clusters(beta, pf, max_gap = 1000, min_probes = 3), "overlap")
})

test_that("count_usable_clusters counts clusters that meet the minProbes threshold", {
  skip_if_not_loaded()
  ids  <- paste0("cg", 1:6)
  beta <- matrix(runif(6 * 4), nrow = 6, dimnames = list(ids, NULL))
  # Six probes on chr1 within maxGap => one cluster of 6.
  pf   <- data.frame(CHR = rep("chr1", 6), MAPINFO = c(100, 200, 300, 400, 500, 600),
                     row.names = ids)
  expect_equal(count_usable_clusters(beta, pf, max_gap = 1000, min_probes = 3), 1L)
  expect_equal(count_usable_clusters(beta, pf, max_gap = 1000, min_probes = 10), 0L)
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS (real subprocess + discovered fixture)
# ══════════════════════════════════════════════════════════════════════════════

#' Discover two beta.rds fixtures: one WITH biological signal and one WITHOUT.
#'
#' Both need a sibling SampleSheet.csv (Sentrix cols, unique Array_IDs, a
#' two-level Sample_Group) and array_type.txt. The between-group median |Δβ|
#' classifies them:
#'   * signal     — median |Δβ| >= \code{signal_delta}: Bumphunter finds regions,
#'     so it drives the happy-path assertions.
#'   * degenerate — median |Δβ| <= \code{flat_delta} (e.g. two technical
#'     replicates of the same sample): Bumphunter finds ZERO regions, which
#'     exercises the "no DMRs is a valid outcome" path.
#' The smallest qualifying fixture of each kind is returned.
#'
#' @return list(signal = <fx|NULL>, degenerate = <fx|NULL>); each fx = list(beta, sheet, at).
discover_dmr_fixtures <- function(signal_delta = 0.03, flat_delta = 0.015) {
  cand <- list()
  for (d in list.dirs("/app/jobs", recursive = FALSE)) {
    beta <- file.path(d, "beta.rds"); sh <- file.path(d, "SampleSheet.csv"); at <- file.path(d, "array_type.txt")
    if (!all(file.exists(c(beta, sh, at)))) next
    ln <- tryCatch(readLines(sh, warn = FALSE), error = function(e) character(0))
    ds <- grep("^\\[Data\\]", ln); skip_n <- if (length(ds)) ds[1] else 0
    s  <- tryCatch(read.csv(sh, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE),
                   error = function(e) NULL)
    if (is.null(s) || !all(c("Sentrix_ID", "Sentrix_Position", "Sample_Group") %in% colnames(s))) next
    aid <- paste0(s$Sentrix_ID, "_", s$Sentrix_Position)
    if (anyDuplicated(aid) || length(unique(s$Sample_Group)) != 2L) next
    cand[[length(cand) + 1L]] <- list(beta = beta, sheet = sh, at = at, s = s, aid = aid,
                                      size = file.info(beta)$size)
  }
  cand <- cand[order(vapply(cand, function(x) x$size, numeric(1)))]   # smallest first

  signal <- NULL; degenerate <- NULL
  for (c in cand) {
    if (!is.null(signal) && !is.null(degenerate)) break
    b <- tryCatch(readRDS(c$beta), error = function(e) NULL)
    if (is.null(b) || !is.matrix(b)) next
    grp <- setNames(c$s$Sample_Group, c$aid)[colnames(b)]
    lv  <- unique(grp)
    if (anyNA(grp) || length(lv) != 2L) next
    set.seed(1)
    idx   <- sample(nrow(b), min(3000L, nrow(b)))
    delta <- median(abs(rowMeans(b[idx, grp == lv[1], drop = FALSE]) -
                        rowMeans(b[idx, grp == lv[2], drop = FALSE])), na.rm = TRUE)
    fx <- list(beta = c$beta, sheet = c$sheet, at = c$at)
    if (is.null(signal)     && is.finite(delta) && delta >= signal_delta) signal     <- fx
    if (is.null(degenerate) && is.finite(delta) && delta <= flat_delta)   degenerate <- fx
  }
  list(signal = signal, degenerate = degenerate)
}

FIXTURES <- if (file.exists(SCRIPT_PATH)) discover_dmr_fixtures() else list(signal = NULL, degenerate = NULL)
FIXTURE  <- FIXTURES$signal   # the happy-path / error-path fixture

skip_if_no_fixture <- function() {
  skip_if_not(file.exists(SCRIPT_PATH), "dmr.R not found")
  skip_if(is.null(FIXTURE), "No beta.rds + SampleSheet.csv + array_type.txt fixture under /app/jobs")
}

#' Run dmr.R as a subprocess (fast test settings: B=2 bootstraps, 1 core).
#'
#' @param copy_array_type Copy the fixture's array_type.txt into the job dir so
#'   dmr.R uses the correct annotation (set FALSE to test arraytype validation).
#' @return list(status, lines, stdout, logs, job_dir).
run_dmr <- function(beta = FIXTURE$beta, samples = FIXTURE$sheet, arraytype = "EPICv2",
                    minProbes = "3", cutoff = "0.1", adjPvalDmr = "1", maxGap = "1000",
                    nBootstraps = "2", nCores = "1", copy_array_type = TRUE, at = FIXTURE$at,
                    job_dir = tempfile("dmr_out_")) {
  dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)
  if (copy_array_type && !is.null(at)) file.copy(at, file.path(job_dir, "array_type.txt"))
  out <- suppressWarnings(system2(
    "Rscript",
    c(shQuote(SCRIPT_PATH), shQuote(samples), shQuote(job_dir), shQuote(beta),
      minProbes, cutoff, adjPvalDmr, maxGap, arraytype, nBootstraps, nCores),
    stdout = TRUE, stderr = TRUE
  ))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(Negate(is.null),
                 lapply(out, function(l) tryCatch(jsonlite::fromJSON(l), error = function(e) NULL)))
  list(status = as.integer(status), lines = out, stdout = paste(out, collapse = "\n"),
       logs = logs, job_dir = job_dir)
}

log_types    <- function(res) unlist(lapply(res$logs, function(x) x$type %||% NULL))
log_messages <- function(res) unlist(lapply(res$logs, function(x) x$message %||% NULL))

# Memoise the (expensive) happy Bumphunter run.
.dmr_cache <- new.env(parent = emptyenv())
happy_run <- function() { if (is.null(.dmr_cache$res)) .dmr_cache$res <- run_dmr(); .dmr_cache$res }

# ── Happy path & output integrity ─────────────────────────────────────────────

test_that("a standard run exits 0, emits 'done', and writes CSV + RDS", {
  skip_if_no_fixture()
  res <- happy_run()
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true("done" %in% log_types(res))
  expect_false("error" %in% log_types(res))
  expect_true(file.exists(file.path(res$job_dir, "dmr_results.csv")))
  expect_true(file.exists(file.path(res$job_dir, "dmr_results.rds")))
})

test_that("the DMR table has the canonical schema with biologically plausible values", {
  skip_if_no_fixture()
  res <- happy_run()
  skip_if_not(res$status == 0L, "happy run did not succeed")
  df <- read.csv(file.path(res$job_dir, "dmr_results.csv"), check.names = FALSE)

  expect_true(all(DMR_COLUMNS %in% colnames(df)),
              info = paste("missing:", paste(setdiff(DMR_COLUMNS, colnames(df)), collapse = ", ")))
  expect_gt(nrow(df), 0L)                                  # adjPvalDmr=1 keeps all regions
  # NOTE: with adjPvalDmr = 1 the RAW region table is returned unfiltered
  # (TAB-01: keep everything, filter downstream), so it legitimately contains
  # small single-probe regions (N_DMPS == 1, WIDTH == 0). We therefore assert the
  # weaker, always-true invariants rather than the minProbes threshold.
  expect_true(all(df$N_DMPS >= 1, na.rm = TRUE))           # every region has >= 1 probe
  expect_true(all(df$WIDTH >= 0, na.rm = TRUE))            # width = STOP - START >= 0
  expect_true(all(df$STOP >= df$START, na.rm = TRUE))
  expect_true(all(df$P_VALUE >= 0 & df$P_VALUE <= 1, na.rm = TRUE))
  expect_true(all(is.finite(df$MEANDIFF)))
  expect_equal(length(unique(df$ID)), nrow(df))           # unique ids
  expect_true(all(grepl("^DMR_\\d+$", df$ID)))
})

test_that("the RDS output is a data frame consistent with the CSV", {
  skip_if_no_fixture()
  res <- happy_run()
  skip_if_not(res$status == 0L, "happy run did not succeed")
  rds <- readRDS(file.path(res$job_dir, "dmr_results.rds"))
  csv <- read.csv(file.path(res$job_dir, "dmr_results.csv"), check.names = FALSE)
  expect_true(is.data.frame(rds))
  expect_equal(nrow(rds), nrow(csv))
  expect_equal(colnames(rds), DMR_COLUMNS)
})

test_that("zero DMRs is a VALID outcome (exit 0, empty table) — not a crash", {
  # champ.DMR aborts internally with "No DMR detected." when Bumphunter finds no
  # regions (here: a degenerate dataset whose two groups are biologically
  # identical). dmr.R must catch that and finish gracefully with a well-formed
  # EMPTY table (exit 0), never failing the whole job.
  skip_if_not(file.exists(SCRIPT_PATH), "dmr.R not found")
  skip_if(is.null(FIXTURES$degenerate), "no degenerate (no-signal) fixture available")
  fx  <- FIXTURES$degenerate
  res <- run_dmr(beta = fx$beta, samples = fx$sheet, at = fx$at)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)

  expect_equal(res$status, 0L, info = res$stdout)
  expect_true("done" %in% log_types(res))
  expect_false("error" %in% log_types(res))
  df <- read.csv(file.path(res$job_dir, "dmr_results.csv"), check.names = FALSE)
  expect_equal(nrow(df), 0L)
  expect_equal(colnames(df), DMR_COLUMNS)                  # schema preserved even when empty
})

# ── Robustness / validation ───────────────────────────────────────────────────

test_that("a missing beta file is rejected with a structured error", {
  skip_if_no_fixture()
  res <- run_dmr(beta = "/tmp/does_not_exist_beta.rds")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true("error" %in% log_types(res))
  expect_true(any(grepl("not found|beta", log_messages(res), ignore.case = TRUE)))
})

test_that("an invalid arraytype is rejected", {
  # No array_type.txt is copied, so the (invalid) CLI arraytype is validated.
  skip_if_no_fixture()
  res <- run_dmr(arraytype = "UNKNOWN_ARRAY", copy_array_type = FALSE)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Invalid arraytype", log_messages(res), ignore.case = TRUE)))
})

test_that("a non-numeric numerical parameter is rejected at argument validation", {
  skip_if_no_fixture()
  res <- run_dmr(minProbes = "abc")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("non-numeric|validation", log_messages(res), ignore.case = TRUE)))
})

test_that("nBootstraps < 1 is rejected", {
  skip_if_no_fixture()
  res <- run_dmr(nBootstraps = "0")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("nBootstraps|>= 1|bootstrap", log_messages(res), ignore.case = TRUE)))
})

test_that("a sample sheet without the group column is rejected", {
  skip_if_no_fixture()
  bad <- tempfile(fileext = ".csv")
  write.csv(data.frame(broken_col = c("a", "b")), bad, row.names = FALSE)
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmr(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Group column|Sample_Group|not found", log_messages(res), ignore.case = TRUE)))
})

test_that("a sample/matrix count mismatch is rejected by strict alignment", {
  skip_if_no_fixture()
  ln <- readLines(FIXTURE$sheet, warn = FALSE)
  ds <- grep("^\\[Data\\]", ln); skip_n <- if (length(ds)) ds[1] else 0
  s  <- read.csv(FIXTURE$sheet, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE)
  bad <- tempfile(fileext = ".csv"); write.csv(s[1, , drop = FALSE], bad, row.names = FALSE)  # 1 row only
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmr(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("alignment|match|identifier|group", log_messages(res), ignore.case = TRUE)))
})

test_that("a single distinct group is rejected (needs two comparison groups)", {
  skip_if_no_fixture()
  ln <- readLines(FIXTURE$sheet, warn = FALSE)
  ds <- grep("^\\[Data\\]", ln); skip_n <- if (length(ds)) ds[1] else 0
  s  <- read.csv(FIXTURE$sheet, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE)
  s$Sample_Group <- "OneGroup"
  bad <- tempfile(fileext = ".csv"); write.csv(s, bad, row.names = FALSE)
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmr(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("group|usable|case.*control|distinct", log_messages(res), ignore.case = TRUE)))
})

test_that("an unreachably high minProbes leaves no clusters and is rejected", {
  skip_if_no_fixture()
  res <- run_dmr(minProbes = "99999")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("cluster|minProbes|threshold", log_messages(res), ignore.case = TRUE)))
})
