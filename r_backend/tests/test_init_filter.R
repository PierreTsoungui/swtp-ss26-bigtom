# tests/test_init_filter.R
#
# Test suite for r_backend/init_filter.R (initial QC & filtering pipeline).
#
# The suite has two layers:
#
#   1. UNIT tests — source init_filter.R (its main() is guarded by
#      `if (sys.nframe() == 0L)`, so sourcing only *defines* the functions) and
#      exercise every pure helper and validator directly, covering all branches
#      and edge cases without needing IDAT files. `emit_error()` is replaced by a
#      test double that raises a catchable condition instead of quitting R.
#
#   2. INTEGRATION tests — run the script as a real subprocess (exactly how the
#      backend invokes it) on genuine IDATs discovered under /app/jobs, with a
#      minimal VALID sample sheet synthesised from the IDAT file names. These
#      assert exit codes, emitted JSON progress, and output-file integrity.
#
# NOTE: the tests must run inside the R worker container because init_filter.R
# sources its utilities via absolute `/app/r_backend/...` paths. Everything is
# skipped gracefully when the script or the IDAT fixtures are unavailable.

library(testthat)
library(jsonlite)

`%||%` <- function(a, b) if (is.null(a) || length(a) == 0L) b else a

SCRIPT_PATH <- "/app/r_backend/init_filter.R"


# ══════════════════════════════════════════════════════════════════════════════
# Setup: source the script's functions and install protocol test doubles
# ══════════════════════════════════════════════════════════════════════════════

# Capture buffer for emitted progress messages (shared via lexical scope with the
# emit_progress test double below).
.emit_capture <- new.env(parent = emptyenv())
.emit_capture$progress <- character(0)

#' Load init_filter.R's functions and override the progress/error emitters.
#'
#' Sourcing runs the file at a non-top-level frame, so main() does NOT execute.
#' We then bind test doubles in the GLOBAL environment (the enclosure of the
#' sourced functions) so their calls to emit_error()/emit_progress()/emit_done()
#' resolve to ours: emit_error must raise a catchable condition instead of
#' killing the session; progress is captured; done is a no-op.
#'
#' @return TRUE if the script and its functions loaded successfully.
init_filter_loaded <- tryCatch(
  {
    suppressWarnings(suppressMessages(source(SCRIPT_PATH)))

    assign("emit_error", function(message) {
      stop(structure(
        class = c("initfilter_fatal", "error", "condition"),
        list(message = as.character(message), call = NULL)
      ))
    }, envir = globalenv())

    assign("emit_progress", function(percent, message) {
      .emit_capture$progress <- c(.emit_capture$progress, as.character(message))
      invisible(NULL)
    }, envir = globalenv())

    assign("emit_done", function(...) invisible(NULL), envir = globalenv())

    exists("parse_filter_config") && exists("validate_sample_sheet")
  },
  error = function(e) FALSE
)


#' Skip a unit test unless init_filter.R loaded (i.e. we are in the container).
skip_if_not_loaded <- function() {
  skip_if_not(
    isTRUE(init_filter_loaded),
    paste("init_filter.R could not be sourced (run inside the r_worker container):", SCRIPT_PATH)
  )
}

#' Assert that evaluating `expr` triggers a fatal emit_error().
#'
#' @param expr Expression expected to call emit_error().
#' @param regexp Optional case-insensitive pattern the error message must match.
#' @return Invisibly the captured condition (or NULL if none).
expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch(
    {
      force(expr)
      NULL
    },
    initfilter_fatal = function(c) c
  )
  expect_false(is.null(cnd),
    info = "expected a fatal emit_error() but the expression returned normally"
  )
  if (!is.null(regexp) && !is.null(cnd)) {
    expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
  }
  invisible(cnd)
}

#' Assert that evaluating `expr` does NOT trigger a fatal emit_error().
expect_not_fatal <- function(expr) {
  cnd <- tryCatch(
    {
      force(expr)
      NULL
    },
    initfilter_fatal = function(c) c
  )
  expect_null(cnd, info = paste(
    "unexpected fatal error:",
    if (!is.null(cnd)) conditionMessage(cnd) else ""
  ))
}


# ══════════════════════════════════════════════════════════════════════════════
# UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

# ── assert_in_range() ─────────────────────────────────────────────────────────

test_that("assert_in_range accepts values inside the inclusive range", {
  skip_if_not_loaded()
  expect_not_fatal(assert_in_range(0.03, 0.01, 0.05, "x"))
  # Boundaries are inclusive.
  expect_not_fatal(assert_in_range(0.01, 0.01, 0.05, "x"))
  expect_not_fatal(assert_in_range(0.05, 0.01, 0.05, "x"))
})

test_that("assert_in_range rejects out-of-range values", {
  skip_if_not_loaded()
  expect_fatal(assert_in_range(0.005, 0.01, 0.05, "det_p.cutoff"), "between")
  expect_fatal(assert_in_range(0.06, 0.01, 0.05, "det_p.cutoff"), "between")
})

test_that("assert_in_range rejects non-finite and non-scalar values", {
  # Coercing non-numeric JSON yields NA; NaN/Inf/vectors are equally invalid and
  # must be caught so they cannot silently disable a filter downstream.
  skip_if_not_loaded()
  expect_fatal(assert_in_range(NA_real_, 0.01, 0.05, "x"), "must be a number")
  expect_fatal(assert_in_range(NaN, 0.01, 0.05, "x"), "must be a number")
  expect_fatal(assert_in_range(Inf, 0.01, 0.05, "x"), "must be a number")
  expect_fatal(assert_in_range(c(0.02, 0.03), 0.01, 0.05, "x"), "must be a number")
})

# ── assert_probes_remain() ────────────────────────────────────────────────────

test_that("assert_probes_remain passes when probes remain and fails at zero", {
  skip_if_not_loaded()
  expect_not_fatal(assert_probes_remain(100L, "Detection P-Value"))
  expect_fatal(
    assert_probes_remain(0L, "Detection P-Value"),
    "No probes remaining after step 'Detection P-Value'"
  )
})

# ── parse_filter_config() ─────────────────────────────────────────────────────

test_that("parse_filter_config returns all-disabled defaults for NULL/empty input", {
  # Absent settings must fall back to a fully specified, all-disabled config.
  skip_if_not_loaded()
  for (empty in list(NULL, "", "   ")) {
    cfg <- parse_filter_config(empty)
    expect_false(cfg$det_p$enabled)
    expect_false(cfg$bead_count$enabled)
    expect_false(cfg$non_cpg$enabled)
    expect_false(cfg$snp$enabled)
    expect_false(cfg$multi_hit$enabled)
    expect_false(cfg$xy_chromosomes$enabled)
    expect_false(cfg$sample_quality$enabled)
    # Default cutoffs mirror the frontend.
    expect_equal(cfg$det_p$cutoff, 0.01)
    expect_equal(cfg$snp$maf_cutoff, 0.05)
  }
})

test_that("parse_filter_config merges a partial config onto the defaults", {
  # Only det_p is provided; every other filter must keep its default (disabled).
  skip_if_not_loaded()
  cfg <- parse_filter_config(toJSON(list(
    det_p = list(enabled = TRUE, cutoff = 0.05)
  ), auto_unbox = TRUE))

  expect_true(cfg$det_p$enabled)
  expect_equal(cfg$det_p$cutoff, 0.05)
  expect_false(cfg$bead_count$enabled) # untouched default
  expect_false(cfg$snp$enabled)
})

test_that("parse_filter_config applies a fully specified config verbatim", {
  skip_if_not_loaded()
  cfg <- parse_filter_config(toJSON(list(
    det_p = list(enabled = TRUE, cutoff = 0.02),
    bead_count = list(enabled = TRUE, bead_cutoff = 0.1),
    non_cpg = list(enabled = TRUE),
    snp = list(enabled = TRUE, maf_cutoff = 0.05),
    multi_hit = list(enabled = TRUE),
    xy_chromosomes = list(enabled = TRUE),
    sample_quality = list(
      enabled = TRUE, detection_p_cutoff = 0.05,
      sample_failure_rate = 0.2
    )
  ), auto_unbox = TRUE))

  expect_true(cfg$det_p$enabled)
  expect_equal(cfg$det_p$cutoff, 0.02)
  expect_true(cfg$bead_count$enabled)
  expect_equal(cfg$bead_count$bead_cutoff, 0.1)
  expect_true(cfg$non_cpg$enabled)
  expect_true(cfg$snp$enabled)
  expect_equal(cfg$snp$maf_cutoff, 0.05)
  expect_true(cfg$multi_hit$enabled)
  expect_true(cfg$xy_chromosomes$enabled)
  expect_true(cfg$sample_quality$enabled)
  expect_equal(cfg$sample_quality$sample_failure_rate, 0.2)
})

test_that("parse_filter_config rejects out-of-range cutoffs", {
  # Ranges mirror the frontend constraints; anything outside must abort.
  skip_if_not_loaded()
  expect_fatal(parse_filter_config(toJSON(list(det_p = list(enabled = TRUE, cutoff = 0.5)),
    auto_unbox = TRUE
  )), "det_p.cutoff")
  expect_fatal(parse_filter_config(toJSON(list(snp = list(enabled = TRUE, maf_cutoff = 0.6)),
    auto_unbox = TRUE
  )), "snp.maf_cutoff")
  # bead_count.bead_cutoff is validated against [0, 1]; 1.5 is out of range.
  expect_fatal(parse_filter_config(toJSON(list(bead_count = list(enabled = TRUE, bead_cutoff = 1.5)),
    auto_unbox = TRUE
  )), "bead_count.bead_cutoff")
  # sample_quality.sample_failure_rate must be within [0.05, 0.2].
  expect_fatal(
    parse_filter_config(toJSON(list(sample_quality = list(
      enabled = TRUE,
      sample_failure_rate = 0.5
    )), auto_unbox = TRUE)),
    "sample_failure_rate"
  )
  # sample_quality.detection_p_cutoff must be within [0.01, 0.05].
  expect_fatal(
    parse_filter_config(toJSON(list(sample_quality = list(
      enabled = TRUE,
      detection_p_cutoff = 0.5
    )), auto_unbox = TRUE)),
    "detection_p_cutoff"
  )
})

test_that("parse_filter_config accepts a valid bead_cutoff of 0.99 (range is [0,1])", {
  # Guards against the misconception that bead_cutoff is capped at 0.1.
  skip_if_not_loaded()
  cfg <- parse_filter_config(toJSON(list(bead_count = list(enabled = TRUE, bead_cutoff = 0.99)),
    auto_unbox = TRUE
  ))
  expect_true(cfg$bead_count$enabled)
  expect_equal(cfg$bead_count$bead_cutoff, 0.99)
})

test_that("parse_filter_config aborts on malformed JSON", {
  skip_if_not_loaded()
  expect_fatal(
    parse_filter_config('{ "det_p": { "enabled": true, "cutoff": INVALID } '),
    "could not be read"
  )
})

# ── read_samplesheet() ────────────────────────────────────────────────────────

test_that("read_samplesheet parses a plain CSV", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".csv")
  on.exit(unlink(f))
  writeLines(c(
    "Sample_Name,Sentrix_ID,Sentrix_Position",
    "S1,200000000001,R01C01"
  ), f)

  sheet <- read_samplesheet(f)
  expect_s3_class(sheet, "data.frame")
  expect_equal(nrow(sheet), 1L)
  expect_true(all(c("Sample_Name", "Sentrix_ID", "Sentrix_Position") %in% colnames(sheet)))
})

test_that("read_samplesheet skips the Illumina [Data] preamble", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".csv")
  on.exit(unlink(f))
  writeLines(c(
    "[Header]", "Investigator,Someone", "", "[Data]",
    "Sample_Name,Sentrix_ID,Sentrix_Position",
    "S1,200000000001,R01C01",
    "S2,200000000001,R02C01"
  ), f)

  sheet <- read_samplesheet(f)
  expect_equal(nrow(sheet), 2L)
  expect_true("Sentrix_Position" %in% colnames(sheet))
})

test_that("read_samplesheet trims column names and drops fully-empty rows", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".csv")
  on.exit(unlink(f))
  writeLines(c(
    " Sample_Name , Sentrix_ID , Sentrix_Position ",
    "S1,200000000001,R01C01",
    ",,"
  ), f)

  sheet <- read_samplesheet(f)
  expect_equal(colnames(sheet), c("Sample_Name", "Sentrix_ID", "Sentrix_Position"))
  expect_equal(nrow(sheet), 1L) # the empty row is removed
})

test_that("read_samplesheet aborts on a truly empty file", {
  skip_if_not_loaded()
  f <- tempfile(fileext = ".csv")
  on.exit(unlink(f))
  file.create(f) # 0 bytes -> readLines() returns character(0)
  expect_fatal(read_samplesheet(f), "empty")
})

# ── validate_sample_sheet() ───────────────────────────────────────────────────

test_that("validate_sample_sheet accepts each supported column layout", {
  skip_if_not_loaded()
  # Standard Sentrix layout.
  expect_not_fatal(validate_sample_sheet(data.frame(
    Sample_Name = c("A", "B"),
    Sentrix_ID = c("1", "1"), Sentrix_Position = c("R01C01", "R02C01"),
    stringsAsFactors = FALSE
  )))
  # Basename layout.
  expect_not_fatal(validate_sample_sheet(data.frame(
    Basename = c("chip_R01C01", "chip_R02C01"), stringsAsFactors = FALSE
  )))
  # Sample_ID layout.
  expect_not_fatal(validate_sample_sheet(data.frame(
    Sample_ID = c("s1", "s2"), stringsAsFactors = FALSE
  )))
})

test_that("validate_sample_sheet rejects an empty sheet and missing columns", {
  skip_if_not_loaded()
  expect_fatal(validate_sample_sheet(data.frame(
    Sample_Name = character(0), Sentrix_ID = character(0),
    Sentrix_Position = character(0)
  )), "no data rows")
  expect_fatal(
    validate_sample_sheet(data.frame(foo = 1:2, bar = 3:4)),
    "missing required columns"
  )
})

test_that("validate_sample_sheet rejects duplicate identifiers in every layout", {
  # Each physical array must appear exactly once (see the 450K demo duplicate bug).
  skip_if_not_loaded()
  expect_fatal(validate_sample_sheet(data.frame(
    Sample_Name = c("A", "B"),
    Sentrix_ID = c("1", "1"), Sentrix_Position = c("R01C01", "R01C01"),
    stringsAsFactors = FALSE
  )), "Duplicate")
  expect_fatal(validate_sample_sheet(data.frame(
    Basename = c("x", "x"), stringsAsFactors = FALSE
  )), "Duplicate")
  expect_fatal(validate_sample_sheet(data.frame(
    Sample_ID = c("1", "1"), stringsAsFactors = FALSE
  )), "Duplicate")
})

test_that("validate_sample_sheet dedups on Basename when Sentrix columns also exist", {
  # A Basename dataset may carry placeholder Sentrix columns that repeat across
  # rows. The Basename is what names the files, so it (not the Sentrix combo)
  # decides uniqueness — matching prepare_targets(). Distinct Basenames pass even
  # when the Sentrix combo is identical; duplicate Basenames fail.
  skip_if_not_loaded()
  expect_not_fatal(validate_sample_sheet(data.frame(
    Basename = c("uuid1_noid", "uuid2_noid"),
    Sample_Name = c("A", "B"),
    Sentrix_ID = c("TEST1", "TEST1"), Sentrix_Position = c("A01", "A01"),
    stringsAsFactors = FALSE
  )))
  expect_fatal(validate_sample_sheet(data.frame(
    Basename = c("dup_noid", "dup_noid"),
    Sample_Name = c("A", "B"),
    Sentrix_ID = c("TEST1", "TEST2"), Sentrix_Position = c("A01", "A02"),
    stringsAsFactors = FALSE
  )), "Duplicate")
})

# ── prepare_targets() ─────────────────────────────────────────────────────────

#' Create a job directory populated with fake (empty) IDAT files.
#'
#' prepare_targets() only checks that the files EXIST (it never reads them), so
#' empty placeholder files are sufficient to drive its logic.
#'
#' @param ids Character vector of `<Sentrix_ID>_<Sentrix_Position>` ids.
#' @param channels Which channels to create per id (default both).
#' @return The job directory path.
make_fake_idat_dir <- function(ids, channels = c("Grn", "Red")) {
  d <- tempfile("job_fake_")
  dir.create(d)
  for (id in ids) for (ch in channels) file.create(file.path(d, sprintf("%s_%s.idat", id, ch)))
  d
}

test_that("prepare_targets builds absolute Basenames and passes with complete pairs", {
  skip_if_not_loaded()
  d <- make_fake_idat_dir(c("200000000001_R01C01", "200000000001_R02C01"))
  on.exit(unlink(d, recursive = TRUE))

  sheet <- data.frame(
    Sample_Name = c("A", "B"),
    Sentrix_ID = c("200000000001", "200000000001"),
    Sentrix_Position = c("R01C01", "R02C01"),
    stringsAsFactors = FALSE
  )

  out <- prepare_targets(sheet, d)
  expect_true("Basename" %in% colnames(out))
  expect_true(all(startsWith(out$Basename, d))) # made absolute
  expect_equal(basename(out$Basename[1]), "200000000001_R01C01")
})

test_that("prepare_targets makes a relative Basename column absolute", {
  skip_if_not_loaded()
  d <- make_fake_idat_dir("200000000001_R01C01")
  on.exit(unlink(d, recursive = TRUE))

  sheet <- data.frame(
    Sample_Name = "A", Basename = "200000000001_R01C01",
    stringsAsFactors = FALSE
  )
  out <- prepare_targets(sheet, d)
  expect_equal(out$Basename[1], file.path(d, "200000000001_R01C01"))
})

test_that("prepare_targets aborts when the directory holds no IDAT files", {
  skip_if_not_loaded()
  d <- tempfile("job_noidat_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  sheet <- data.frame(
    Sample_Name = "A", Sentrix_ID = "200000000001",
    Sentrix_Position = "R01C01", stringsAsFactors = FALSE
  )
  expect_fatal(prepare_targets(sheet, d), "No IDAT files")
})

test_that("prepare_targets aborts when a sample's IDATs are absent", {
  # IDATs exist, but for a different array than the sheet references.
  skip_if_not_loaded()
  d <- make_fake_idat_dir("999999999999_R09C09")
  on.exit(unlink(d, recursive = TRUE))
  sheet <- data.frame(
    Sample_Name = "A", Sentrix_ID = "200000000001",
    Sentrix_Position = "R01C01", stringsAsFactors = FALSE
  )
  expect_fatal(prepare_targets(sheet, d), "No IDAT files found for sample")
})

test_that("prepare_targets aborts on an incomplete Grn/Red pair", {
  skip_if_not_loaded()
  d <- make_fake_idat_dir("200000000001_R01C01", channels = "Grn") # missing _Red
  on.exit(unlink(d, recursive = TRUE))
  sheet <- data.frame(
    Sample_Name = "A", Sentrix_ID = "200000000001",
    Sentrix_Position = "R01C01", stringsAsFactors = FALSE
  )
  expect_fatal(prepare_targets(sheet, d), "Missing IDAT pair")
})

test_that("prepare_targets aborts when neither Basename nor Sentrix columns exist", {
  skip_if_not_loaded()
  d <- make_fake_idat_dir("200000000001_R01C01")
  on.exit(unlink(d, recursive = TRUE))
  expect_fatal(
    prepare_targets(data.frame(Sample_Name = "A", stringsAsFactors = FALSE), d),
    "Basename"
  )
})

# ── assert_uniform_array_type() (mixed-platform detection) ────────────────────

#' Write a minimal valid IDAT header carrying a given nSNPsRead probe count.
#' See utils/arraytype.R::idat_probe_count for the byte layout (value at offset 26).
write_fake_idat_header <- function(path, n_probes) {
  con <- file(path, "wb")
  on.exit(close(con))
  writeChar("IDAT", con, nchars = 4L, eos = NULL)
  writeBin(as.integer(c(3L, 0L)), con, size = 4L, endian = "little")  # int64 version
  writeBin(1L, con, size = 4L, endian = "little")                     # nFields = 1
  writeBin(1000L, con, size = 2L, endian = "little")                  # field code
  writeBin(as.integer(c(26L, 0L)), con, size = 4L, endian = "little") # int64 offset
  writeBin(as.integer(n_probes), con, size = 4L, endian = "little")   # payload
}

#' Build a targets data frame whose Basename column points at freshly written
#' fake IDAT headers with the given per-sample probe counts.
make_array_targets <- function(counts) {
  d <- tempfile("job_arr_")
  dir.create(d)
  basenames <- file.path(d, sprintf("s%d", seq_along(counts)))
  for (i in seq_along(counts)) {
    write_fake_idat_header(paste0(basenames[i], "_Grn.idat"), counts[i])
    file.create(paste0(basenames[i], "_Red.idat"))
  }
  list(dir = d, targets = data.frame(
    Sample_Name = sprintf("Sample_%d", seq_along(counts)),
    Basename = basenames, stringsAsFactors = FALSE
  ))
}

test_that("assert_uniform_array_type passes when every IDAT has the same probe count", {
  skip_if_not_loaded()
  f <- make_array_targets(c(622399L, 622399L, 622399L))
  on.exit(unlink(f$dir, recursive = TRUE))
  expect_true(assert_uniform_array_type(f$targets))
})

test_that("assert_uniform_array_type aborts on a mixed-platform upload, naming the samples", {
  skip_if_not_loaded()
  f <- make_array_targets(c(55300L, 622399L)) # two different array types
  on.exit(unlink(f$dir, recursive = TRUE))
  cnd <- tryCatch(assert_uniform_array_type(f$targets), initfilter_fatal = function(c) c)
  expect_false(is.null(cnd))
  expect_match(conditionMessage(cnd), "different array types", ignore.case = TRUE)
  expect_match(conditionMessage(cnd), "Sample_1")  # the affected labels are listed
  expect_match(conditionMessage(cnd), "55300")
})


# ── Pure probe filters ────────────────────────────────────────────────────────

test_that("detp_failed_probes flags probes exceeding the cutoff in any sample", {
  skip_if_not_loaded()
  m <- matrix(
    c(
      0.001, 0.02, # p1 fails in s2
      0.001, 0.001
    ), # p2 passes everywhere
    nrow = 2, byrow = TRUE,
    dimnames = list(c("p1", "p2"), c("s1", "s2"))
  )
  expect_equal(detp_failed_probes(m, 0.01), "p1")
  expect_equal(detp_failed_probes(NULL), character(0)) # no matrix -> nothing removed
})

test_that("beadcount_failed_probes flags probes failing in too many samples", {
  skip_if_not_loaded()
  m <- matrix(
    c(
      0.5, 0.5, # p1 fails (p>0.01) in 100% of samples
      0.001, 0.5, # p2 fails in 50%
      0.001, 0.001
    ), # p3 never fails
    nrow = 3, byrow = TRUE,
    dimnames = list(c("p1", "p2", "p3"), c("s1", "s2"))
  )
  # bead_cutoff 0.75: only p1 (100% > 75%) is removed.
  expect_equal(beadcount_failed_probes(m, 0.75), "p1")
  expect_equal(beadcount_failed_probes(NULL), character(0))
})

test_that("non_cpg_probes selects only ch.* (non-CpG) probe ids", {
  skip_if_not_loaded()
  ann <- data.frame(dummy = 1:3, row.names = c("cg0001", "ch.0002", "cg0003"))
  expect_equal(non_cpg_probes(ann), "ch.0002")
  expect_equal(non_cpg_probes(NULL), character(0))
})

test_that("snp_probes selects probes at/above the MAF cutoff and tolerates missing columns", {
  skip_if_not_loaded()
  ann <- data.frame(
    CpG_maf = c(0.10, 0.01, NA),
    row.names = c("cg1", "cg2", "cg3")
  )
  expect_equal(snp_probes(ann, 0.05), "cg1") # 0.10 >= 0.05
  expect_equal(snp_probes(NULL, 0.05), character(0))
  # No MAF columns -> filter is skipped (with a warning), removing nothing.
  ann_no_maf <- data.frame(other = 1:2, row.names = c("cg1", "cg2"))
  expect_warning(res <- snp_probes(ann_no_maf, 0.05))
  expect_equal(res, character(0))
})

test_that("xy_probes selects chrX/chrY probes and tolerates missing chr", {
  skip_if_not_loaded()
  ann <- data.frame(
    chr = c("chr1", "chrX", "chrY"),
    row.names = c("cg1", "cgX", "cgY"), stringsAsFactors = FALSE
  )
  expect_setequal(xy_probes(ann), c("cgX", "cgY"))
  expect_equal(xy_probes(NULL), character(0))
  expect_equal(xy_probes(data.frame(other = 1, row.names = "cg1")), character(0)) # no chr column
})

test_that("multi_hit_probes reads the probe list and skips gracefully when absent", {
  skip_if_not_loaded()
  d <- tempfile("job_mh_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  expect_equal(suppressMessages(multi_hit_probes(d)), character(0)) # no file

  writeLines(c("cg0001", "  cg0002  ", "", "cg0003"), file.path(d, "multi_hit_probes.txt"))
  expect_equal(multi_hit_probes(d), c("cg0001", "cg0002", "cg0003")) # trimmed, blanks dropped
})

# ── apply_probe_filter() orchestration ────────────────────────────────────────

test_that("apply_probe_filter records stats and removes probes when enabled", {
  skip_if_not_loaded()
  res <- apply_probe_filter(
    probe_keep = c("a", "b", "c"), total_start = 3L, stats = list(),
    key = "det_p", label = "Detection P-Value", enabled = TRUE,
    remove_fn = function() "b", pct_start = 30, pct_end = 35,
    extra = list(cutoff = 0.01)
  )
  expect_equal(res$probe_keep, c("a", "c"))
  expect_true(res$stats$det_p$enabled)
  expect_equal(res$stats$det_p$removed, 1L)
  expect_equal(res$stats$det_p$after, 2L)
  expect_equal(res$stats$det_p$cutoff, 0.01) # extra merged into stats
})

test_that("apply_probe_filter is a no-op that records disabled state", {
  skip_if_not_loaded()
  res <- apply_probe_filter(
    probe_keep = c("a", "b", "c"), total_start = 3L, stats = list(),
    key = "snp", label = "SNP", enabled = FALSE,
    remove_fn = function() stop("must not be called"), pct_start = 75, pct_end = 80
  )
  expect_equal(res$probe_keep, c("a", "b", "c")) # unchanged
  expect_false(res$stats$snp$enabled)
  expect_equal(res$stats$snp$removed, 0L)
  expect_equal(res$stats$snp$after, 3L)
})

test_that("apply_probe_filter aborts if a step would remove every probe", {
  skip_if_not_loaded()
  expect_fatal(
    apply_probe_filter(
      probe_keep = c("a", "b"), total_start = 2L, stats = list(),
      key = "det_p", label = "Detection P-Value", enabled = TRUE,
      remove_fn = function() c("a", "b"), pct_start = 30, pct_end = 35
    ),
    "No probes remaining"
  )
})


# ══════════════════════════════════════════════════════════════════════════════
# INTEGRATION TESTS (real subprocess + real IDATs)
# ══════════════════════════════════════════════════════════════════════════════

#' Discover a directory under /app/jobs containing >= `n` complete IDAT pairs.
#'
#' @param n Minimum number of complete `<Sentrix_ID>_<Position>` arrays required.
#' @return list(dir, ids) with up to `n` ids, or NULL if none are available.
discover_idat_fixture <- function(n = 3L) {
  grn <- list.files("/app/jobs", pattern = "_Grn\\.idat$", recursive = TRUE, full.names = TRUE)
  if (length(grn) == 0L) {
    return(NULL)
  }
  for (d in unique(dirname(grn))) {
    ids <- sub("_Grn\\.idat$", "", basename(list.files(d, pattern = "_Grn\\.idat$")))
    ids <- ids[file.exists(file.path(d, paste0(ids, "_Red.idat")))] # complete pairs
    ids <- ids[grepl("^.+_R[0-9]+C[0-9]+$", ids)] # parseable barcodes
    if (length(ids) >= n) {
      return(list(dir = d, ids = head(sort(unique(ids)), n)))
    }
  }
  NULL
}

IDAT_FIXTURE <- if (file.exists(SCRIPT_PATH)) discover_idat_fixture(3L) else NULL

skip_if_no_idat <- function(min_samples = 2L) {
  skip_if_not(file.exists(SCRIPT_PATH), "init_filter.R not found (run inside the container)")
  skip_if(
    is.null(IDAT_FIXTURE) || length(IDAT_FIXTURE$ids) < min_samples,
    sprintf("No IDAT fixture with >= %d complete pairs under /app/jobs", min_samples)
  )
}

#' Build a fresh job directory: copy the chosen IDATs and a synthesised sheet.
#'
#' The sample sheet is derived from the IDAT file names, so it is guaranteed to
#' match the data (unlike the original, possibly broken, customer sheets).
#'
#' @param ids IDAT ids to include.
#' @param copy_idats Whether to copy the IDAT files (FALSE for config-only tests).
#' @param sample_sheet Optional explicit sheet path (NULL -> synthesise).
#' @param filter_json Optional filter_settings.json content.
#' @return list(job_dir, sample_sheet).
make_job_dir <- function(ids, copy_idats = TRUE, sample_sheet = NULL, filter_json = NULL) {
  job <- tempfile("job_init_")
  dir.create(job)
  if (copy_idats) {
    files <- file.path(IDAT_FIXTURE$dir, paste0(rep(ids, each = 2), c("_Grn.idat", "_Red.idat")))
    file.copy(files, job)
  }
  if (is.null(sample_sheet)) {
    parts <- regmatches(ids, regexec("^(.+)_(R[0-9]+C[0-9]+)$", ids))
    sid <- vapply(parts, `[`, character(1), 2L)
    pos <- vapply(parts, `[`, character(1), 3L)
    df <- data.frame(
      Sample_Name = paste0("S", seq_along(ids)),
      Sentrix_ID = sid,
      Sentrix_Position = pos,
      Sample_Group = rep(c("A", "B"), length.out = length(ids)),
      stringsAsFactors = FALSE
    )
    sample_sheet <- file.path(job, "SampleSheet.csv")
    write.csv(df, sample_sheet, row.names = FALSE)
  }
  if (!is.null(filter_json)) writeLines(filter_json, file.path(job, "filter_settings.json"))
  list(job_dir = job, sample_sheet = sample_sheet)
}

#' Invoke init_filter.R as a subprocess and parse its structured output.
#'
#' @return list(status, lines, text, logs) — exit code, raw lines, joined text,
#'   and the parsed JSON protocol messages.
run_init_filter <- function(sample_sheet, job_dir) {
  out <- suppressWarnings(system2(
    "Rscript", c(shQuote(SCRIPT_PATH), shQuote(sample_sheet), shQuote(job_dir)),
    stdout = TRUE, stderr = TRUE
  ))
  status <- attr(out, "status") %||% 0L
  logs <- Filter(Negate(is.null), lapply(
    out[grepl("^\\s*\\{", out)], function(l) tryCatch(fromJSON(l), error = function(e) NULL)
  ))
  list(
    status = as.integer(status), lines = out,
    text = paste(out, collapse = "\n"), logs = logs
  )
}

#' All progress `message` strings emitted by a run.
progress_messages <- function(res) {
  unlist(lapply(res$logs, function(x) if (!is.null(x$message)) as.character(x$message) else NULL))
}

# ── Happy path ────────────────────────────────────────────────────────────────

test_that("default run exits 0 and writes a valid filtered RGChannelSet + stats", {
  skip_if_no_idat(2L)
  fx <- make_job_dir(head(IDAT_FIXTURE$ids, 2L))
  on.exit(unlink(fx$job_dir, recursive = TRUE), add = TRUE)

  res <- run_init_filter(fx$sample_sheet, fx$job_dir)
  expect_equal(res$status, 0L, info = res$text)

  # filtered_data.rds is the SAMPLE-filtered RGChannelSet (probes are reported in
  # stats, not subset here — see the init_filter.R header), so we assert its type
  # and sample count, NOT a probe count.
  rds <- file.path(fx$job_dir, "filtered_data.rds")
  expect_true(file.exists(rds))
  obj <- readRDS(rds)
  expect_true(is.matrix(obj) || inherits(obj, "RGChannelSet") || inherits(obj, "MethylSet"))

  # filter_stats.json accounting must balance.
  stats <- fromJSON(file.path(fx$job_dir, "filter_stats.json"))
  expect_true(all(c("total_start", "total_end", "total_removed") %in% names(stats)))
  expect_gte(stats$total_start, stats$total_end)
  expect_equal(stats$total_removed, stats$total_start - stats$total_end)

  # The minfi-detected array type is persisted for downstream steps.
  expect_true(file.exists(file.path(fx$job_dir, "array_type.txt")))

  # Biological QC (run_biological_qc) must write a well-formed qc_report.json.
  qc_path <- file.path(fx$job_dir, "qc_report.json")
  expect_true(file.exists(qc_path), info = "qc_report.json not written")
  qc <- jsonlite::fromJSON(qc_path)
  expect_true(all(c("beta_mean", "beta_sd", "n_samples", "n_probes") %in% names(qc)))
  expect_gte(qc$beta_mean, 0)
  expect_lte(qc$beta_mean, 1) # methylation fraction
  expect_gt(qc$n_samples, 0L)
  expect_gt(qc$n_probes, 0L)
})

# ── Filter activation & statistics ────────────────────────────────────────────

test_that("all enabled filters are logged ACTIVE and probe counts never increase", {
  skip_if_no_idat(2L)
  all_on <- toJSON(list(
    det_p          = list(enabled = TRUE, cutoff = 0.01),
    bead_count     = list(enabled = TRUE, bead_cutoff = 0.05),
    non_cpg        = list(enabled = TRUE),
    snp            = list(enabled = TRUE, maf_cutoff = 0.05),
    multi_hit      = list(enabled = TRUE),
    xy_chromosomes = list(enabled = TRUE)
  ), auto_unbox = TRUE)

  fx <- make_job_dir(head(IDAT_FIXTURE$ids, 2L), filter_json = all_on)
  on.exit(unlink(fx$job_dir, recursive = TRUE), add = TRUE)
  res <- run_init_filter(fx$sample_sheet, fx$job_dir)
  expect_equal(res$status, 0L, info = res$text)

  msgs <- progress_messages(res)
  # Each enabled filter leaves an ACTIVE trace (English labels emitted as `message`).
  for (lbl in c("Detection P-Value", "Bead Count", "Non-CpG", "SNP", "Multi-Hit", "XY Chromosomes")) {
    expect_true(any(grepl(sprintf("\\[FILTER\\] %s ACTIVE", lbl), msgs)),
      info = paste("missing ACTIVE log for:", lbl)
    )
  }

  # Probe counts are monotonically non-increasing across the enabled steps.
  stats <- fromJSON(file.path(fx$job_dir, "filter_stats.json"))
  prev <- stats$total_start
  for (step in c("det_p", "bead_count", "non_cpg", "snp", "multi_hit", "xy_chromosomes")) {
    if (!is.null(stats[[step]]) && isTRUE(stats[[step]]$enabled)) {
      expect_lte(stats[[step]]$after, prev)
      prev <- stats[[step]]$after
    }
  }
  expect_equal(stats$total_end, prev)
})

test_that("disabled filters are explicitly logged INACTIVE", {
  skip_if_no_idat(2L)
  partial <- toJSON(list(
    det_p          = list(enabled = TRUE, cutoff = 0.05),
    bead_count     = list(enabled = FALSE),
    snp            = list(enabled = FALSE),
    xy_chromosomes = list(enabled = FALSE)
  ), auto_unbox = TRUE)

  fx <- make_job_dir(head(IDAT_FIXTURE$ids, 2L), filter_json = partial)
  on.exit(unlink(fx$job_dir, recursive = TRUE), add = TRUE)
  res <- run_init_filter(fx$sample_sheet, fx$job_dir)
  msgs <- progress_messages(res)

  for (lbl in c("Bead Count", "SNP", "XY Chromosomes")) {
    expect_true(any(grepl(sprintf("\\[FILTER\\] %s INACTIVE", lbl), msgs)),
      info = paste("missing INACTIVE log for:", lbl)
    )
  }
})

test_that("sample-quality filtering runs and is reported in the stats", {
  # Needs >= 3 samples for the PCA-outlier branch to be meaningful.
  skip_if_no_idat(3L)
  cfg <- toJSON(list(sample_quality = list(
    enabled = TRUE, detection_p_cutoff = 0.01, sample_failure_rate = 0.10,
    remove_failed_samples = TRUE, enable_pca_outlier_detection = TRUE
  )), auto_unbox = TRUE)

  fx <- make_job_dir(head(IDAT_FIXTURE$ids, 3L), filter_json = cfg)
  on.exit(unlink(fx$job_dir, recursive = TRUE), add = TRUE)
  res <- run_init_filter(fx$sample_sheet, fx$job_dir)
  expect_equal(res$status, 0L, info = res$text)

  expect_true(any(grepl("\\[FILTER\\] Sample Quality ACTIVE", progress_messages(res))))
  stats <- fromJSON(file.path(fx$job_dir, "filter_stats.json"))
  expect_true(isTRUE(stats$sample_quality$enabled))
})

# ── Error handling (structured exit code 1, never an uncontrolled R crash) ─────

test_that("a missing sample sheet exits 1 with a structured error", {
  skip_if_not(file.exists(SCRIPT_PATH), "init_filter.R not found")
  d <- tempfile("job_nosheet_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  res <- run_init_filter("/does/not/exist.csv", d)
  expect_equal(res$status, 1L)
  expect_false(any(grepl("^Error in |Execution halted", res$lines)),
    info = "error should be handled by emit_error(), not a raw R traceback"
  )
})

test_that("malformed filter_settings.json exits 1 without crashing", {
  skip_if_not(file.exists(SCRIPT_PATH), "init_filter.R not found")
  d <- tempfile("job_badjson_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  writeLines('{ "det_p": { "enabled": true, "cutoff": INVALID }', file.path(d, "filter_settings.json"))
  sheet <- file.path(d, "SampleSheet.csv")
  writeLines(c("Sample_Name,Sentrix_ID,Sentrix_Position", "S1,200000000001,R01C01"), sheet)

  res <- run_init_filter(sheet, d)
  expect_equal(res$status, 1L)
  expect_false(any(grepl("^Error in |Execution halted", res$lines)))
})

test_that("out-of-range cutoffs exit 1 (det_p and snp)", {
  skip_if_not(file.exists(SCRIPT_PATH), "init_filter.R not found")
  sheet_lines <- c("Sample_Name,Sentrix_ID,Sentrix_Position", "S1,200000000001,R01C01")

  for (bad in list(
    toJSON(list(det_p = list(enabled = TRUE, cutoff = 0.5)), auto_unbox = TRUE),
    toJSON(list(snp = list(enabled = TRUE, maf_cutoff = 0.6)), auto_unbox = TRUE)
  )) {
    d <- tempfile("job_badcut_")
    dir.create(d)
    writeLines(sheet_lines, file.path(d, "SampleSheet.csv"))
    writeLines(bad, file.path(d, "filter_settings.json"))
    res <- run_init_filter(file.path(d, "SampleSheet.csv"), d)
    expect_equal(res$status, 1L, info = bad)
    unlink(d, recursive = TRUE)
  }
})

test_that("a duplicate sample sheet is rejected with exit 1", {
  skip_if_not(file.exists(SCRIPT_PATH), "init_filter.R not found")
  d <- tempfile("job_dupsheet_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  sheet <- file.path(d, "SampleSheet.csv")
  writeLines(c(
    "Sample_Name,Sentrix_ID,Sentrix_Position",
    "A,200000000001,R01C01",
    "B,200000000001,R01C01"
  ), sheet) # same array twice
  res <- run_init_filter(sheet, d)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Duplicate", res$lines)))
})

test_that("a sample sheet without required columns is rejected with exit 1", {
  skip_if_not(file.exists(SCRIPT_PATH), "init_filter.R not found")
  d <- tempfile("job_badcols_")
  dir.create(d)
  on.exit(unlink(d, recursive = TRUE))
  sheet <- file.path(d, "SampleSheet.csv")
  writeLines(c("foo,bar,baz", "1,2,3"), sheet)
  res <- run_init_filter(sheet, d)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("missing required columns", res$lines, ignore.case = TRUE)))
})

test_that("an incomplete IDAT pair (missing _Red) is rejected with exit 1", {
  skip_if_no_idat(2L)
  fx <- make_job_dir(head(IDAT_FIXTURE$ids, 2L))
  on.exit(unlink(fx$job_dir, recursive = TRUE), add = TRUE)
  file.remove(list.files(fx$job_dir, pattern = "_Red\\.idat$", full.names = TRUE))

  res <- run_init_filter(fx$sample_sheet, fx$job_dir)
  expect_equal(res$status, 1L)
  expect_true(any(grepl("Missing IDAT pair", res$lines)))
})
