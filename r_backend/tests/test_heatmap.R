# =============================================================================
# TEST SUITE: heatmap.R
#
# CONTRACT UNDER TEST
#   CLI:  Rscript heatmap.R <result.rds> <sample_sheet.csv> <job_dir>
#   Renders a methylation heatmap (PNG + vector PDF) from a DMP/DMR result table.
#
#   SINGLE FILTER SOURCE (important): heatmap.R does NOT filter by p-value /
#   chromosome / delta-beta itself. The backend performs all filtering ONCE and
#   writes the chosen CpG IDs to <job_dir>/heatmap_input.csv; heatmap.R only
#   subsets to that list, guaranteeing the heatmap matches the table view. Every
#   successful run therefore REQUIRES heatmap_input.csv to exist.
#
#   Beta source: if <job_dir>/beta.rds exists -> per-sample columns (Sentrix
#   addresses mapped to Sample_Names); otherwise the GROUP*_AVG columns of the
#   result table are used (group-average mode).
#
#   Configuration is via environment variables: HEATMAP_GROUP1/2, HEATMAP_MAX_ROWS
#   (default 1000), HEATMAP_OUTPUT (default heatmap.png), HEATMAP_INPUT
#   (default heatmap_input.csv). There is NO HEATMAP_ADJ_PVAL_MAX / HEATMAP_CHR.
#
# TWO LAYERS
#   1. UNIT — the pure annotation helpers (utils/heatmap_anno.R): build_colours
#      and make_anno_spec (categorical vs. continuous encoding).
#   2. INTEGRATION — run the real script via Rscript on synthetic inputs, always
#      providing heatmap_input.csv.
# =============================================================================

library(testthat)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH <- "/app/r_backend/heatmap.R"
ANNO_UTIL <- "/app/r_backend/utils/heatmap_anno.R"


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS — annotation helpers (utils/heatmap_anno.R)
# ══════════════════════════════════════════════════════════════════════════════

anno_loaded <- tryCatch(
  {
    suppressWarnings(suppressMessages(library(circlize))) # make_anno_spec continuous path
    source(ANNO_UTIL)
    exists("build_colours") && exists("make_anno_spec")
  },
  error = function(e) FALSE
)

skip_if_no_anno <- function() {
  skip_if_not(
    isTRUE(anno_loaded),
    paste("utils/heatmap_anno.R could not be sourced (needs circlize):", ANNO_UTIL)
  )
}

test_that("build_colours maps every level to a colour and recycles beyond 12", {
  skip_if_no_anno()
  cols <- build_colours(c("A", "B", "A", "C"))
  expect_equal(sort(names(cols)), c("A", "B", "C")) # one entry per distinct level
  expect_true(all(grepl("^#[0-9A-Fa-f]{6}$", cols)))

  many <- build_colours(paste0("L", 1:15))
  expect_length(many, 15L)
  expect_equal(unname(many["L13"]), unname(many["L1"])) # palette (12) recycled
})

test_that("make_anno_spec treats a categorical column as discrete swatches", {
  skip_if_no_anno()
  spec <- make_anno_spec("Group", c("Case", "Ctrl", "Case", "Ctrl"))
  expect_equal(spec$kind, "discrete")
  expect_equal(spec$name, "Group")
  expect_type(spec$col, "character") # named colour vector
  expect_true(all(c("Case", "Ctrl") %in% names(spec$col)))
})

test_that("make_anno_spec treats a many-valued numeric column as a continuous gradient", {
  skip_if_no_anno()
  spec <- make_anno_spec("Age", as.character(20:40)) # 21 distinct numeric values
  expect_equal(spec$kind, "continuous")
  expect_true(is.function(spec$col)) # colorRamp2 function
  expect_true(is.numeric(spec$values))
})

test_that("make_anno_spec keeps a low-cardinality numeric column discrete", {
  # A small numeric code (e.g. a batch id) must NOT become a colour gradient.
  skip_if_no_anno()
  spec <- make_anno_spec("Batch", as.character(c(1, 2, 3, 1, 2)))
  expect_equal(spec$kind, "discrete")
})

test_that("make_anno_spec keeps a constant numeric column discrete (no degenerate range)", {
  skip_if_no_anno()
  spec <- make_anno_spec("Const", as.character(rep(5, 20)))
  expect_equal(spec$kind, "discrete")
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS (real subprocess)
# ══════════════════════════════════════════════════════════════════════════════

#' Write a minimal DMP result table (group-average friendly) as RDS.
#'
#' Includes GROUP1_AVG/GROUP2_AVG (so group-average mode has data), CHR/POS (so
#' the genomic sort runs), an ID column and CpG-id rownames.
#'
#' @param path Output RDS path.
#' @param n Number of CpG rows.
#' @return The CpG ids (invisibly).
write_dmp_rds <- function(path, n = 10L) {
  set.seed(42)
  ids <- sprintf("cg%08d", seq_len(n))
  df <- data.frame(
    ID = ids,
    CHR = sample(paste0("chr", 1:22), n, replace = TRUE),
    POS = sample(1e6:2e8, n),
    GENE = paste0("GENE", seq_len(n)), FEATURE = "TSS200", CGI = "Island",
    ADJ_P = runif(n, 0.001, 0.04),
    GROUP1_AVG = runif(n, 0.1, 0.5), GROUP2_AVG = runif(n, 0.5, 0.9),
    DELTA_BETA = runif(n, -1, 1), LOG_FC = runif(n, -3, 3), DMR_ID = "-",
    stringsAsFactors = FALSE
  )
  rownames(df) <- ids
  saveRDS(df, path)
  invisible(ids)
}

#' Write a minimal Illumina-style sample sheet.
write_sheet <- function(path, groups = c("Group_A", "Group_B"), n_per = 2L) {
  n <- n_per * length(groups)
  df <- data.frame(
    Sample_Name = paste0("S", seq_len(n)),
    Sample_Group = rep(groups, each = n_per),
    Sentrix_ID = paste0("ID", seq_len(n)),
    Sentrix_Position = paste0("R0", seq_len(n), "C01"),
    stringsAsFactors = FALSE
  )
  write.csv(df, path, row.names = FALSE)
  invisible(df)
}

#' Assemble a self-contained job dir and run heatmap.R as a subprocess.
#'
#' @param n_cpg Rows in the DMP table.
#' @param select_ids CpG ids written to heatmap_input.csv (NULL = all rows).
#' @param write_input Whether to write heatmap_input.csv at all.
#' @param beta Optional per-sample beta matrix (writes beta.rds -> per-sample mode).
#' @param env Named list of HEATMAP_* environment variables.
#' @param result_rds,sheet Override paths (for missing-file tests).
#' @return list(status, lines, stdout, logs, job_dir, output).
run_heatmap <- function(n_cpg = 10L, select_ids = NULL, write_input = TRUE,
                        beta = NULL, env = list(),
                        result_rds = NULL, sheet = NULL, job_dir = NULL) {
  jd <- job_dir %||% tempfile("hm_job_")
  if (is.null(job_dir)) dir.create(jd, recursive = TRUE)

  if (is.null(result_rds)) {
    result_rds <- file.path(jd, "dmp_results.rds")
    ids <- write_dmp_rds(result_rds, n_cpg)
  } else {
    ids <- character(0)
  }
  if (is.null(sheet)) {
    sheet <- file.path(jd, "sheet.csv")
    write_sheet(sheet)
  }
  if (write_input) {
    sel <- select_ids %||% ids
    write.csv(data.frame(ID = sel, stringsAsFactors = FALSE),
      file.path(jd, "heatmap_input.csv"),
      row.names = FALSE
    )
  }
  if (!is.null(beta)) saveRDS(beta, file.path(jd, "beta.rds"))

  env_vec <- if (length(env)) paste0(names(env), "=", unlist(env)) else character(0)
  out <- suppressWarnings(system2(
    "Rscript", c(shQuote(SCRIPT_PATH), shQuote(result_rds), shQuote(sheet), shQuote(jd)),
    stdout = TRUE, stderr = TRUE, env = env_vec
  ))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(
    function(x) !is.null(x) && is.list(x),
    lapply(out, function(l) tryCatch(jsonlite::fromJSON(l), error = function(e) NULL))
  )
  list(
    status = as.integer(status), lines = out, stdout = paste(out, collapse = "\n"),
    logs = logs, job_dir = jd,
    output = file.path(jd, env$HEATMAP_OUTPUT %||% "heatmap.png")
  )
}

log_types <- function(res) unlist(lapply(res$logs, function(x) x$type %||% NULL))
log_messages <- function(res) unlist(lapply(res$logs, function(x) x$message %||% NULL))

skip_if_no_script <- function() skip_if_not(file.exists(SCRIPT_PATH), "heatmap.R not found")

# Memoise the group-average happy run.
.hm_cache <- new.env(parent = emptyenv())
happy_run <- function() {
  if (is.null(.hm_cache$res)) .hm_cache$res <- run_heatmap()
  .hm_cache$res
}

# ── Happy path (group-average mode) ───────────────────────────────────────────

test_that("group-average run exits 0, signals 'done', and writes PNG + PDF", {
  skip_if_no_script()
  res <- happy_run()
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true("done" %in% log_types(res))
  expect_false("error" %in% log_types(res))

  expect_true(file.exists(res$output), info = "heatmap.png not created")
  expect_gt(file.size(res$output), 1000L) # a real image, not empty
  pdf <- file.path(res$job_dir, "heatmap.pdf")
  expect_true(file.exists(pdf), info = "heatmap.pdf not created")
})

test_that("CpGs are sorted by genomic position when chr/pos are present", {
  skip_if_no_script()
  res <- happy_run()
  expect_true(any(grepl("sorted by genomic position", log_messages(res), ignore.case = TRUE)))
})

test_that("a custom HEATMAP_OUTPUT filename is honoured (default not created)", {
  skip_if_no_script()
  res <- run_heatmap(env = list(HEATMAP_OUTPUT = "custom_heatmap.png"))
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(res$job_dir, "custom_heatmap.png")))
  expect_true(file.exists(file.path(res$job_dir, "custom_heatmap.pdf"))) # derived name
  expect_false(file.exists(file.path(res$job_dir, "heatmap.png")))
})

# ── Per-sample mode (beta.rds present) ────────────────────────────────────────

test_that("per-sample mode renders from beta.rds mapped via Sentrix addresses", {
  skip_if_no_script()
  jd <- tempfile("hm_persample_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE), add = TRUE)
  ids <- write_dmp_rds(file.path(jd, "dmp_results.rds"), n = 8L)
  sheet_df <- write_sheet(file.path(jd, "sheet.csv"))
  # beta.rds columns are the Sentrix addresses (Sentrix_ID + "_" + Position).
  addrs <- paste0(sheet_df$Sentrix_ID, "_", sheet_df$Sentrix_Position)
  bmat <- matrix(runif(length(ids) * length(addrs)),
    nrow = length(ids),
    dimnames = list(ids, addrs)
  )

  res <- run_heatmap(
    job_dir = jd, result_rds = file.path(jd, "dmp_results.rds"),
    sheet = file.path(jd, "sheet.csv"), beta = bmat, select_ids = ids
  )
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(any(grepl("recovered from beta.rds|Sentrix addresses mapped", log_messages(res), ignore.case = TRUE)))
  expect_true(file.exists(file.path(jd, "heatmap.png")))
})

# ── Robustness / validation ───────────────────────────────────────────────────

test_that("wrong argument count is rejected with a usage error", {
  skip_if_no_script()
  out <- suppressWarnings(system2("Rscript", c(shQuote(SCRIPT_PATH), "a", "b"), stdout = TRUE, stderr = TRUE))
  expect_true((attr(out, "status") %||% 0L) != 0L)
  expect_match(paste(out, collapse = "\n"), "Usage", fixed = TRUE)
})

test_that("a missing result.rds is rejected", {
  skip_if_no_script()
  jd <- tempfile("hm_nords_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE))
  write_sheet(file.path(jd, "sheet.csv"))
  res <- run_heatmap(
    job_dir = jd, result_rds = file.path(jd, "nope.rds"),
    sheet = file.path(jd, "sheet.csv")
  )
  expect_equal(res$status, 1L)
  expect_true(any(grepl("result.rds not found", log_messages(res), ignore.case = TRUE)))
})

test_that("a missing sample sheet is rejected", {
  skip_if_no_script()
  jd <- tempfile("hm_nosheet_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE))
  write_dmp_rds(file.path(jd, "dmp_results.rds"))
  res <- run_heatmap(
    job_dir = jd, result_rds = file.path(jd, "dmp_results.rds"),
    sheet = file.path(jd, "nope.csv")
  )
  expect_equal(res$status, 1L)
  expect_true(any(grepl("sample_sheet.csv not found", log_messages(res), ignore.case = TRUE)))
})

test_that("a non-existent job_dir is rejected", {
  skip_if_no_script()
  jd <- tempfile("hm_setup_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE))
  rds <- file.path(jd, "dmp_results.rds")
  write_dmp_rds(rds)
  sh <- file.path(jd, "sheet.csv")
  write_sheet(sh)
  out <- suppressWarnings(system2("Rscript",
    c(shQuote(SCRIPT_PATH), shQuote(rds), shQuote(sh), shQuote("/no/such/dir")),
    stdout = TRUE, stderr = TRUE
  ))
  status <- attr(out, "status") %||% 0L
  expect_true(status != 0L)
  expect_true(any(grepl("job_dir does not exist", out, ignore.case = TRUE)))
})

test_that("an empty DMP table is rejected", {
  skip_if_no_script()
  jd <- tempfile("hm_empty_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE))
  rds <- file.path(jd, "dmp_results.rds")
  saveRDS(data.frame(ID = character(0), GROUP1_AVG = numeric(0), GROUP2_AVG = numeric(0)), rds)
  write_sheet(file.path(jd, "sheet.csv"))
  res <- run_heatmap(job_dir = jd, result_rds = rds, sheet = file.path(jd, "sheet.csv"))
  expect_equal(res$status, 1L)
  expect_true(any(grepl("empty", log_messages(res), ignore.case = TRUE)))
})

test_that("a non-data-frame result.rds is rejected", {
  skip_if_no_script()
  jd <- tempfile("hm_badtype_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE))
  rds <- file.path(jd, "dmp_results.rds")
  saveRDS(list("not", "a", "data frame"), rds) # a list -> obj[[1]] is a string
  write_sheet(file.path(jd, "sheet.csv"))
  res <- run_heatmap(job_dir = jd, result_rds = rds, sheet = file.path(jd, "sheet.csv"))
  expect_equal(res$status, 1L)
  expect_true(any(grepl("data.frame", log_messages(res), ignore.case = TRUE)))
})

test_that("a missing heatmap_input.csv is rejected (single filter source required)", {
  skip_if_no_script()
  res <- run_heatmap(write_input = FALSE)
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Heatmap input not found", log_messages(res), ignore.case = TRUE)))
})

test_that("a heatmap_input.csv selecting no matching CpGs is rejected", {
  skip_if_no_script()
  res <- run_heatmap(select_ids = c("cgDOESNOTEXIST1", "cgDOESNOTEXIST2"))
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("None of the selected CpGs", log_messages(res), ignore.case = TRUE)))
})

# ── Configuration: HEATMAP_MAX_ROWS ───────────────────────────────────────────

test_that("HEATMAP_MAX_ROWS below the selected row count is rejected", {
  skip_if_no_script()
  res <- run_heatmap(n_cpg = 10L, env = list(HEATMAP_MAX_ROWS = "1"))
  on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Too many rows|Hard limit", log_messages(res), ignore.case = TRUE)))
})

test_that("an invalid HEATMAP_MAX_ROWS (0 or non-numeric) is rejected", {
  skip_if_no_script()
  for (val in c("0", "abc")) {
    res <- run_heatmap(env = list(HEATMAP_MAX_ROWS = val))
    on.exit(unlink(res$job_dir, recursive = TRUE), add = TRUE)
    expect_equal(res$status, 1L, info = paste("HEATMAP_MAX_ROWS =", val))
    expect_true(any(grepl("positive integer", log_messages(res), ignore.case = TRUE)),
      info = paste("HEATMAP_MAX_ROWS =", val)
    )
  }
})

# ── Beta quality guard ────────────────────────────────────────────────────────

test_that("an NA-heavy beta matrix is rejected", {
  # > 20% NA in the beta matrix aborts (grey-cell soup is not a useful heatmap).
  skip_if_no_script()
  jd <- tempfile("hm_na_")
  dir.create(jd)
  on.exit(unlink(jd, recursive = TRUE))
  ids <- write_dmp_rds(file.path(jd, "dmp_results.rds"), n = 8L)
  sheet_df <- write_sheet(file.path(jd, "sheet.csv"))
  addrs <- paste0(sheet_df$Sentrix_ID, "_", sheet_df$Sentrix_Position)
  bmat <- matrix(runif(length(ids) * length(addrs)),
    nrow = length(ids),
    dimnames = list(ids, addrs)
  )
  bmat[sample(length(bmat), ceiling(length(bmat) * 0.5))] <- NA # 50% NA
  res <- run_heatmap(
    job_dir = jd, result_rds = file.path(jd, "dmp_results.rds"),
    sheet = file.path(jd, "sheet.csv"), beta = bmat, select_ids = ids
  )
  expect_equal(res$status, 1L)
  expect_true(any(grepl("NA values", log_messages(res), ignore.case = TRUE)))
})

# ── Annotation column selection: HEATMAP_GROUP1 / HEATMAP_GROUP2 ───────────────
# These only take effect in PER-SAMPLE mode (group-average mode uses clean group
# labels), so each test writes a beta.rds plus a two-grouping-column sheet.

#' Build a per-sample heatmap job with Sample_Group AND Batch grouping columns.
#' @return list(job, rds, sheet) with heatmap_input.csv already written.
setup_grouping_job <- function(n = 4L) {
  jd <- tempfile("hm_grp_")
  dir.create(jd)
  ids <- write_dmp_rds(file.path(jd, "dmp_results.rds"), n = 8L)
  sids <- paste0("ID", seq_len(n))
  pos <- paste0("R0", seq_len(n), "C01")
  addrs <- paste0(sids, "_", pos)
  sheet <- data.frame(
    Sample_Name = paste0("S", seq_len(n)),
    Sample_Group = rep(c("A", "B"), length.out = n),
    Batch = rep(c("X", "Y"), each = n %/% 2L),
    Sentrix_ID = sids, Sentrix_Position = pos, stringsAsFactors = FALSE
  )
  shp <- file.path(jd, "sheet.csv")
  write.csv(sheet, shp, row.names = FALSE)
  saveRDS(
    matrix(runif(length(ids) * n), nrow = length(ids), dimnames = list(ids, addrs)),
    file.path(jd, "beta.rds")
  )
  write.csv(data.frame(ID = ids), file.path(jd, "heatmap_input.csv"), row.names = FALSE)
  list(job = jd, rds = file.path(jd, "dmp_results.rds"), sheet = shp)
}

#' Run heatmap.R on a prepared grouping job with environment variables.
run_hm_grp <- function(s, env = list()) {
  env_vec <- if (length(env)) paste0(names(env), "=", unlist(env)) else character(0)
  out <- suppressWarnings(system2("Rscript",
    c(shQuote(SCRIPT_PATH), shQuote(s$rds), shQuote(s$sheet), shQuote(s$job)),
    stdout = TRUE, stderr = TRUE, env = env_vec
  ))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(
    function(x) !is.null(x) && is.list(x),
    lapply(out, function(l) tryCatch(jsonlite::fromJSON(l), error = function(e) NULL))
  )
  list(
    status = as.integer(status), lines = out, stdout = paste(out, collapse = "\n"),
    logs = logs, job = s$job
  )
}

test_that("HEATMAP_GROUP1 selects an explicit primary annotation column", {
  skip_if_no_script()
  s <- setup_grouping_job()
  on.exit(unlink(s$job, recursive = TRUE), add = TRUE)
  res <- run_hm_grp(s, env = list(HEATMAP_GROUP1 = "Batch"))
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(s$job, "heatmap.png")))
})

test_that("an unknown HEATMAP_GROUP1 column is rejected", {
  skip_if_no_script()
  s <- setup_grouping_job()
  on.exit(unlink(s$job, recursive = TRUE), add = TRUE)
  res <- run_hm_grp(s, env = list(HEATMAP_GROUP1 = "NoSuchColumn"))
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Primary grouping column not found", log_messages(res), ignore.case = TRUE)))
})

test_that("HEATMAP_GROUP2 adds a secondary annotation and renders", {
  skip_if_no_script()
  s <- setup_grouping_job()
  on.exit(unlink(s$job, recursive = TRUE), add = TRUE)
  res <- run_hm_grp(s, env = list(HEATMAP_GROUP1 = "Sample_Group", HEATMAP_GROUP2 = "Batch"))
  expect_equal(res$status, 0L, info = res$stdout)
  expect_true(file.exists(file.path(s$job, "heatmap.png")))
})

test_that("identical primary/secondary annotation columns are rejected", {
  skip_if_no_script()
  s <- setup_grouping_job()
  on.exit(unlink(s$job, recursive = TRUE), add = TRUE)
  res <- run_hm_grp(s, env = list(HEATMAP_GROUP1 = "Sample_Group", HEATMAP_GROUP2 = "Sample_Group"))
  expect_equal(res$status, 1L)
  expect_true(any(grepl("must be different", log_messages(res), ignore.case = TRUE)))
})
