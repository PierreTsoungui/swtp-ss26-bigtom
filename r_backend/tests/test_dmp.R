# =============================================================================
# TEST SUITE: dmp.R
#
# CONTRACT UNDER TEST
#   CLI:  Rscript dmp.R <sample_sheet> <job_dir> <beta> [adjPVal] [arraytype]
#         [group_column] [case] [control]
#   Runs champ.DMP and writes dmp_results.csv/.rds with columns
#   ID, CHR, POS, GENE, FEATURE, CGI, ADJ_P, GROUP1_AVG, GROUP2_AVG, DELTA_BETA,
#   LOG_FC, DMR_ID. Progress/errors are single-line JSON; success ends with
#   {"type":"done"}.
#
# IMPORTANT — ACTUAL CONTRACT (intentional corrections to earlier tests)
#   * ALL probes are kept: champ.DMP always runs with adjPVal = 1 (TAB-01);
#     significance is a DOWNSTREAM table filter. The CLI `adjPVal` argument is
#     ignored for filtering, so:
#       - ADJ_P is NOT bounded by 0.05 (it spans [0, 1]);
#       - `adjPVal = 0` does NOT trigger an error (exit 0, full table).
#   * LOG_FC IS part of the output schema (still computed).
#   * Non-finite probes are DROPPED (drop_invariant_probes), not rejected with a
#     dedicated "finite" error.
#   dmp.R correctly rejects: < 2 samples per group, and identical within-group
#   replicates (zero-variance guard).
#
# TWO LAYERS
#   1. UNIT — source dmp.R (guarded by `sys.nframe()==0L`) and test build_dmp_output
#      and link_dmrs directly. emit_error() becomes a catchable condition.
#   2. INTEGRATION — run the real script on a beta.rds + SampleSheet.csv +
#      array_type.txt fixture discovered under /app/jobs. The one champ.DMP happy
#      run is memoised; a degenerate (identical-duplicate) fixture drives the
#      zero-variance guard.
# =============================================================================

library(testthat)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH <- "/app/r_backend/dmp.R"
DMP_COLUMNS <- c(
  "ID", "CHR", "POS", "GENE", "FEATURE", "CGI", "ADJ_P",
  "GROUP1_AVG", "GROUP2_AVG", "DELTA_BETA", "LOG_FC", "DMR_ID"
)


# ══════════════════════════════════════════════════════════════════════════════
# Setup: source functions + catchable emit_error() double
# ══════════════════════════════════════════════════════════════════════════════

dmp_loaded <- tryCatch(
  {
    suppressWarnings(suppressMessages(source(SCRIPT_PATH)))
    assign("emit_error", function(message) {
      stop(structure(
        class = c("dmp_fatal", "error", "condition"),
        list(message = as.character(message), call = NULL)
      ))
    }, envir = globalenv())
    assign("emit_progress", function(percent, message) invisible(NULL), envir = globalenv())
    exists("build_dmp_output") && exists("link_dmrs")
  },
  error = function(e) FALSE
)

skip_if_not_loaded <- function() {
  skip_if_not(
    isTRUE(dmp_loaded),
    paste("dmp.R could not be sourced (run in the r_worker container):", SCRIPT_PATH)
  )
}

expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch(
    {
      force(expr)
      NULL
    },
    dmp_fatal = function(c) c
  )
  expect_false(is.null(cnd), info = "expected a fatal emit_error() but none was raised")
  if (!is.null(regexp) && !is.null(cnd)) expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
  invisible(cnd)
}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── build_dmp_output() ────────────────────────────────────────────────────────

#' Build a minimal champ.DMP-like result table + matching beta for unit tests.
mk_dmp_inputs <- function() {
  dmp_table <- data.frame(
    CHR = c("1", "2"), MAPINFO = c(100, 200),
    gene = c("G1", "G2"), feature = c("Body", "TSS200"), cgi = c("island", "opensea"),
    adj.P.Val = c(0.02, 0.9), row.names = c("cg1", "cg2"), stringsAsFactors = FALSE
  )
  # Case columns high, control columns low -> positive Delta Beta.
  beta <- matrix(
    c(
      0.8, 0.7, 0.2, 0.1, # cg1: case ~0.75, ctrl ~0.15
      0.4, 0.5, 0.5, 0.6
    ), # cg2: case ~0.45, ctrl ~0.55
    nrow = 2, byrow = TRUE,
    dimnames = list(c("cg1", "cg2"), c("caseA", "caseB", "ctrlA", "ctrlB"))
  )
  pheno <- factor(c("Case", "Case", "Ctrl", "Ctrl"), levels = c("Ctrl", "Case"))
  list(dmp_table = dmp_table, beta = beta, pheno = pheno)
}

test_that("build_dmp_output assembles the canonical schema with deterministic Delta Beta", {
  skip_if_not_loaded()
  x <- mk_dmp_inputs()
  out <- build_dmp_output(x$dmp_table, x$beta, x$pheno, "Case", "Ctrl")

  expect_equal(colnames(out), DMP_COLUMNS)
  expect_equal(out$ID, c("cg1", "cg2"))
  expect_equal(out$CHR, c("1", "2"))
  expect_equal(out$GENE, c("G1", "G2"))
  expect_equal(out$ADJ_P, c(0.02, 0.9))
  # GROUP1 = case mean, GROUP2 = control mean, Delta = case - control.
  expect_equal(out$GROUP1_AVG, c(mean(c(0.8, 0.7)), mean(c(0.4, 0.5))))
  expect_equal(out$GROUP2_AVG, c(mean(c(0.2, 0.1)), mean(c(0.5, 0.6))))
  expect_equal(out$DELTA_BETA, out$GROUP1_AVG - out$GROUP2_AVG)
  expect_true(all(out$DMR_ID == "-")) # no DMRs linked yet
  expect_true(all(is.finite(out$LOG_FC)))
})

test_that("build_dmp_output errors when no p-value column is recognizable", {
  skip_if_not_loaded()
  x <- mk_dmp_inputs()
  bad <- x$dmp_table[, setdiff(colnames(x$dmp_table), "adj.P.Val"), drop = FALSE]
  expect_fatal(build_dmp_output(bad, x$beta, x$pheno, "Case", "Ctrl"), "p-value")
})

test_that("build_dmp_output falls back to empty strings for absent annotation columns", {
  skip_if_not_loaded()
  dt <- data.frame(
    CHR = "1", MAPINFO = 100, P.Value = 0.04, row.names = "cg1",
    stringsAsFactors = FALSE
  ) # no gene/feature/cgi
  beta <- matrix(c(0.8, 0.2), nrow = 1, dimnames = list("cg1", c("caseA", "ctrlA")))
  # need >=1 col per group; add a second sample each to compute means
  beta <- matrix(c(0.8, 0.9, 0.2, 0.1),
    nrow = 1,
    dimnames = list("cg1", c("caseA", "caseB", "ctrlA", "ctrlB"))
  )
  ph <- factor(c("Case", "Case", "Ctrl", "Ctrl"), levels = c("Ctrl", "Case"))
  out <- build_dmp_output(dt, beta, ph, "Case", "Ctrl")
  expect_equal(out$GENE, "")
  expect_equal(out$FEATURE, "")
  expect_equal(out$CGI, "")
  expect_equal(out$ADJ_P, 0.04) # picked P.Value fallback
})

# ── link_dmrs() ───────────────────────────────────────────────────────────────

#' A DMP data.frame with the columns link_dmrs needs.
mk_dmp_df <- function(chr, pos) {
  data.frame(
    CHR = as.character(chr), POS = pos, DMR_ID = rep("-", length(pos)),
    stringsAsFactors = FALSE
  )
}

test_that("link_dmrs is a no-op when there is no dmr_results.rds", {
  skip_if_not_loaded()
  d <- tempfile("job_nolink_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  out <- link_dmrs(mk_dmp_df(c("1", "1"), c(100, 200)), d)
  expect_true(all(out$DMR_ID == "-"))
})

test_that("link_dmrs is a no-op for an empty DMR table", {
  skip_if_not_loaded()
  d <- tempfile("job_emptylink_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  saveRDS(
    data.frame(ID = character(0), CHR = character(0), START = numeric(0), STOP = numeric(0)),
    file.path(d, "dmr_results.rds")
  )
  out <- link_dmrs(mk_dmp_df("1", 100), d)
  expect_true(all(out$DMR_ID == "-"))
})

test_that("link_dmrs tags CpGs inside a region and leaves the rest as '-'", {
  skip_if_not_loaded()
  d <- tempfile("job_link_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  saveRDS(
    data.frame(ID = "DMR_1", CHR = "1", START = 100, STOP = 200, stringsAsFactors = FALSE),
    file.path(d, "dmr_results.rds")
  )
  # cg at 150/chr1 overlaps; 300/chr1 outside; 150/chr2 wrong chromosome.
  out <- link_dmrs(mk_dmp_df(c("1", "1", "2"), c(150, 300, 150)), d)
  expect_equal(out$DMR_ID, c("DMR_1", "-", "-"))
})

test_that("link_dmrs assigns the first overlapping region and tolerates NA positions", {
  skip_if_not_loaded()
  d <- tempfile("job_link2_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  saveRDS(
    data.frame(
      ID = c("DMR_A", "DMR_B"), CHR = c("1", "1"),
      START = c(100, 120), STOP = c(200, 300), stringsAsFactors = FALSE
    ),
    file.path(d, "dmr_results.rds")
  )
  out <- link_dmrs(mk_dmp_df(c("1", "1"), c(150, NA)), d)
  expect_true(out$DMR_ID[1] %in% c("DMR_A", "DMR_B")) # first overlap wins
  expect_equal(out$DMR_ID[2], "-") # NA position stays unlinked
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS (real subprocess + discovered fixture)
# ══════════════════════════════════════════════════════════════════════════════

#' Discover a beta.rds fixture WITH biological signal and one WITHOUT (degenerate,
#' identical within-group replicates). See the dmr.R suite for the rationale.
#' @return list(signal, degenerate); each = list(beta, sheet, at) or NULL.
discover_dmp_fixtures <- function(signal_delta = 0.03, flat_delta = 0.015) {
  cand <- list()
  for (d in list.dirs("/app/jobs", recursive = FALSE)) {
    beta <- file.path(d, "beta.rds")
    sh <- file.path(d, "SampleSheet.csv")
    at <- file.path(d, "array_type.txt")
    if (!all(file.exists(c(beta, sh, at)))) next
    ln <- tryCatch(readLines(sh, warn = FALSE), error = function(e) character(0))
    ds <- grep("^\\[Data\\]", ln)
    skip_n <- if (length(ds)) ds[1] else 0
    s <- tryCatch(read.csv(sh, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE),
      error = function(e) NULL
    )
    if (is.null(s) || !all(c("Sentrix_ID", "Sentrix_Position", "Sample_Group") %in% colnames(s))) next
    aid <- paste0(s$Sentrix_ID, "_", s$Sentrix_Position)
    if (anyDuplicated(aid) || length(unique(s$Sample_Group)) != 2L) next
    cand[[length(cand) + 1L]] <- list(
      beta = beta, sheet = sh, at = at, s = s, aid = aid,
      size = file.info(beta)$size
    )
  }
  cand <- cand[order(vapply(cand, function(x) x$size, numeric(1)))]
  signal <- NULL
  degenerate <- NULL
  for (c in cand) {
    if (!is.null(signal) && !is.null(degenerate)) break
    b <- tryCatch(readRDS(c$beta), error = function(e) NULL)
    if (is.null(b) || !is.matrix(b)) next
    grp <- setNames(c$s$Sample_Group, c$aid)[colnames(b)]
    lv <- unique(grp)
    if (anyNA(grp) || length(lv) != 2L) next
    set.seed(1)
    idx <- sample(nrow(b), min(3000L, nrow(b)))
    delta <- median(abs(rowMeans(b[idx, grp == lv[1], drop = FALSE]) -
      rowMeans(b[idx, grp == lv[2], drop = FALSE])), na.rm = TRUE)
    fx <- list(beta = c$beta, sheet = c$sheet, at = c$at)
    if (is.null(signal) && is.finite(delta) && delta >= signal_delta) signal <- fx
    if (is.null(degenerate) && is.finite(delta) && delta <= flat_delta) degenerate <- fx
  }
  list(signal = signal, degenerate = degenerate)
}

FIXTURES <- if (file.exists(SCRIPT_PATH)) discover_dmp_fixtures() else list(signal = NULL, degenerate = NULL)
FIXTURE <- FIXTURES$signal

skip_if_no_fixture <- function() {
  skip_if_not(file.exists(SCRIPT_PATH), "dmp.R not found")
  skip_if(is.null(FIXTURE), "No signal beta.rds fixture under /app/jobs")
}

#' Run dmp.R as a subprocess.
run_dmp <- function(beta = FIXTURE$beta, samples = FIXTURE$sheet, adjPVal = "1",
                    arraytype = "EPICv2", at = FIXTURE$at, copy_array_type = TRUE,
                    job_dir = tempfile("dmp_out_")) {
  dir.create(job_dir, showWarnings = FALSE, recursive = TRUE)
  if (copy_array_type && !is.null(at)) file.copy(at, file.path(job_dir, "array_type.txt"))
  out <- suppressWarnings(system2(
    "Rscript", c(
      shQuote(SCRIPT_PATH), shQuote(samples), shQuote(job_dir), shQuote(beta),
      adjPVal, arraytype
    ),
    stdout = TRUE, stderr = TRUE
  ))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(
    Negate(is.null),
    lapply(out, function(l) tryCatch(jsonlite::fromJSON(l), error = function(e) NULL))
  )
  list(
    status = as.integer(status), lines = out, stdout = paste(out, collapse = "\n"),
    logs = logs, job_dir = job_dir
  )
}

log_types <- function(res) unlist(lapply(res$logs, function(x) x$type %||% NULL))
log_messages <- function(res) unlist(lapply(res$logs, function(x) x$message %||% NULL))

# Memoise the (expensive) happy champ.DMP run.
.dmp_cache <- new.env(parent = emptyenv())
happy_run <- function() {
  if (is.null(.dmp_cache$res)) .dmp_cache$res <- run_dmp()
  .dmp_cache$res
}

# ── Happy path & keep-all behaviour ───────────────────────────────────────────

test_that("a standard run exits 0, emits 'done', and writes CSV + RDS", {
  skip_if_no_fixture()
  res <- happy_run()
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true("done" %in% log_types(res))
  expect_false("error" %in% log_types(res))
  expect_true(file.exists(file.path(res$job_dir, "dmp_results.csv")))
  expect_true(file.exists(file.path(res$job_dir, "dmp_results.rds")))
})

test_that("the DMP table has the canonical schema with valid effect sizes", {
  skip_if_no_fixture()
  res <- happy_run()
  skip_if_not(res$status == 0L, "happy run failed")
  df <- read.csv(file.path(res$job_dir, "dmp_results.csv"), check.names = FALSE)

  expect_true(all(DMP_COLUMNS %in% colnames(df)),
    info = paste("missing:", paste(setdiff(DMP_COLUMNS, colnames(df)), collapse = ", "))
  )
  expect_gt(nrow(df), 0L)
  expect_true(all(df$GROUP1_AVG >= 0 & df$GROUP1_AVG <= 1, na.rm = TRUE))
  expect_true(all(df$GROUP2_AVG >= 0 & df$GROUP2_AVG <= 1, na.rm = TRUE))
  expect_true(all(df$DELTA_BETA >= -1 & df$DELTA_BETA <= 1, na.rm = TRUE))
  # Delta Beta is exactly GROUP1_AVG - GROUP2_AVG (deterministic effect size).
  expect_equal(df$DELTA_BETA, df$GROUP1_AVG - df$GROUP2_AVG, tolerance = 1e-6)
  expect_true(all(is.finite(df$LOG_FC)))
  expect_true(all(df$DMR_ID == "-")) # no dmr_results.rds present
})

test_that("ALL probes are kept (TAB-01): ADJ_P is NOT filtered to <= 0.05", {
  # champ.DMP runs with adjPVal = 1 regardless of the CLI value; significance is a
  # downstream table filter, so the raw table contains non-significant probes too.
  # (The happy run passed adjPVal = "1"; since the argument is ignored for
  # filtering, its output already proves the keep-all contract.)
  skip_if_no_fixture()
  res <- happy_run()
  skip_if_not(res$status == 0L, "happy run failed")
  df <- read.csv(file.path(res$job_dir, "dmp_results.csv"), check.names = FALSE)
  expect_true(all(df$ADJ_P >= 0 & df$ADJ_P <= 1, na.rm = TRUE))
  expect_gt(max(df$ADJ_P, na.rm = TRUE), 0.05) # non-significant probes retained
})

test_that("the RDS output is a data frame consistent with the CSV", {
  skip_if_no_fixture()
  res <- happy_run()
  skip_if_not(res$status == 0L, "happy run failed")
  rds <- readRDS(file.path(res$job_dir, "dmp_results.rds"))
  csv <- read.csv(file.path(res$job_dir, "dmp_results.csv"), check.names = FALSE)
  expect_true(is.data.frame(rds))
  expect_equal(nrow(rds), nrow(csv))
  expect_equal(colnames(rds), DMP_COLUMNS)
})

# ── Robustness / validation ───────────────────────────────────────────────────

test_that("a missing beta file is rejected with a structured error", {
  skip_if_no_fixture()
  res <- run_dmp(beta = "/tmp/does_not_exist_beta.rds")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true("error" %in% log_types(res))
  expect_true(any(grepl("not found|beta", log_messages(res), ignore.case = TRUE)))
})

test_that("a corrupted beta RDS is reported cleanly (no raw crash)", {
  skip_if_no_fixture()
  bad <- tempfile(fileext = ".rds")
  writeBin(charToRaw("not an rds"), bad)
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmp(beta = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true("error" %in% log_types(res))
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("a missing sample sheet is rejected", {
  skip_if_no_fixture()
  res <- run_dmp(samples = "/tmp/does_not_exist_sheet.csv")
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("not found", log_messages(res), ignore.case = TRUE)))
})

test_that("an invalid arraytype is rejected", {
  skip_if_no_fixture()
  res <- run_dmp(arraytype = "UNKNOWN_ARRAY", copy_array_type = FALSE)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Invalid arraytype", log_messages(res), ignore.case = TRUE)))
})

test_that("a sample sheet without the group column is rejected", {
  skip_if_no_fixture()
  bad <- tempfile(fileext = ".csv")
  write.csv(data.frame(broken_col = c("a", "b")), bad, row.names = FALSE)
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmp(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Group column|Sample_Group|not found", log_messages(res), ignore.case = TRUE)))
})

test_that("a sample/matrix count mismatch is rejected by strict alignment", {
  skip_if_no_fixture()
  ln <- readLines(FIXTURE$sheet, warn = FALSE)
  ds <- grep("^\\[Data\\]", ln)
  skip_n <- if (length(ds)) ds[1] else 0
  s <- read.csv(FIXTURE$sheet, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE)
  bad <- tempfile(fileext = ".csv")
  write.csv(s[1, , drop = FALSE], bad, row.names = FALSE)
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmp(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true("error" %in% log_types(res))
})

test_that("a single distinct group is rejected (two comparison groups required)", {
  skip_if_no_fixture()
  ln <- readLines(FIXTURE$sheet, warn = FALSE)
  ds <- grep("^\\[Data\\]", ln)
  skip_n <- if (length(ds)) ds[1] else 0
  s <- read.csv(FIXTURE$sheet, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE)
  s$Sample_Group <- "OneGroup"
  bad <- tempfile(fileext = ".csv")
  write.csv(s, bad, row.names = FALSE)
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmp(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("group|usable|distinct|case.*control", log_messages(res), ignore.case = TRUE)))
})

test_that("a group with fewer than two replicates is rejected (no fake replication)", {
  # dmp.R requires >= 2 samples per group and does NOT fabricate replicates.
  skip_if_no_fixture()
  ln <- readLines(FIXTURE$sheet, warn = FALSE)
  ds <- grep("^\\[Data\\]", ln)
  skip_n <- if (length(ds)) ds[1] else 0
  s <- read.csv(FIXTURE$sheet, skip = skip_n, check.names = FALSE, stringsAsFactors = FALSE)
  skip_if(nrow(s) < 3L, "need >= 3 samples to build a 1-vs-rest split")
  s$Sample_Group <- "Multi"
  s$Sample_Group[1] <- "Solo" # Solo = 1 sample
  bad <- tempfile(fileext = ".csv")
  write.csv(s, bad, row.names = FALSE)
  on.exit(unlink(bad), add = TRUE)
  res <- run_dmp(samples = bad)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("at least two samples per group|per group", log_messages(res), ignore.case = TRUE)))
})

# ── Biological guardrail: identical within-group replicates ───────────────────

test_that("identical within-group duplicates are rejected before limma (zero variance)", {
  # A degenerate dataset (two technical replicates of the same sample per group)
  # has zero within-group variance; dmp.R must reject it with an actionable
  # message instead of the opaque limma "No sample variance".
  skip_if_not(file.exists(SCRIPT_PATH), "dmp.R not found")
  skip_if(is.null(FIXTURES$degenerate), "no degenerate (identical-duplicate) fixture available")
  fx <- FIXTURES$degenerate
  res <- run_dmp(beta = fx$beta, samples = fx$sheet, at = fx$at)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("zero variance|identical duplicates|residual variance",
    log_messages(res),
    ignore.case = TRUE
  )))
})

test_that("an all-invariant beta matrix is rejected before champ.DMP", {
  # Coverage gap: the early "No valid probes remain" exit. Every probe is constant
  # across samples -> drop_invariant_probes removes all rows -> abort before the
  # (expensive) champ.DMP call. Runs without a real fixture (fails at cleaning).
  skip_if_not(file.exists(SCRIPT_PATH), "dmp.R not found")
  jd <- tempfile("dmp_flat_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE), add = TRUE)
  beta <- matrix(0.5,
    nrow = 100, ncol = 4,
    dimnames = list(paste0("cg", 1:100), paste0("206_R0", 1:4, "C01"))
  )
  brds <- file.path(jd, "beta.rds")
  saveRDS(beta, brds)
  sheet <- file.path(jd, "sheet.csv")
  write.csv(data.frame(
    Sample_Name = paste0("S", 1:4), Sample_Group = rep(c("A", "B"), 2),
    Sentrix_ID = "206", Sentrix_Position = paste0("R0", 1:4, "C01"),
    stringsAsFactors = FALSE
  ), sheet, row.names = FALSE)

  res <- run_dmp(beta = brds, samples = sheet, at = NULL, copy_array_type = FALSE, job_dir = jd)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("No valid probes|invariant|non-finite", log_messages(res), ignore.case = TRUE)))
})
