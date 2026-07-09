# =============================================================================
# UNIT TESTS: utils/samplesheet.R
#
# Sample-sheet reading + the shared sample/matrix aligner and case/control
# resolver used by DMP/DMR/SVD/batch-correction. Alignment and resolution report
# fatal problems via emit_error(), replaced here by a catchable condition.
# =============================================================================

library(testthat)

source("/app/r_backend/utils/progress.R")
assign("emit_error", function(message) {
  stop(structure(
    class = c("util_fatal", "error", "condition"),
    list(message = as.character(message), call = NULL)
  ))
}, envir = globalenv())
source("/app/r_backend/utils/samplesheet.R")

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

# ── Small helpers ─────────────────────────────────────────────────────────────

test_that("read_sample_sheet_smart parses plain and Illumina [Data] CSVs", {
  f1 <- tempfile(fileext = ".csv")
  on.exit(unlink(f1), add = TRUE)
  writeLines(c("Sample_Name,Sentrix_ID,Sentrix_Position", "S1,206,R01C01"), f1)
  s1 <- read_sample_sheet_smart(f1)
  expect_s3_class(s1, "data.frame")
  expect_equal(nrow(s1), 1L)

  f2 <- tempfile(fileext = ".csv")
  on.exit(unlink(f2), add = TRUE)
  writeLines(c(
    "[Header]", "x,y", "", "[Data]",
    "Sample_Name,Sentrix_ID,Sentrix_Position", "S1,206,R01C01", "S2,206,R02C01"
  ), f2)
  s2 <- read_sample_sheet_smart(f2)
  expect_equal(nrow(s2), 2L)
  expect_true("Sentrix_Position" %in% colnames(s2))
})

test_that("normalize_id strips all whitespace and control characters", {
  expect_equal(normalize_id(c("  206_R01 C01 ", "a\tb\nc")), c("206_R01C01", "abc"))
})

test_that("sample_sheet_array_id joins Sentrix id and position", {
  s <- data.frame(
    Sentrix_ID = c("206", "207"), Sentrix_Position = c("R01C01", "R02C01"),
    stringsAsFactors = FALSE
  )
  expect_equal(sample_sheet_array_id(s), c("206_R01C01", "207_R02C01"))
})

test_that(".strip_idat_suffix removes IDAT decorations and the directory", {
  expect_equal(
    .strip_idat_suffix(c("/p/206_R01C01_Grn.idat", "206_R02C01_Red.idat")),
    c("206_R01C01", "206_R02C01")
  )
})

test_that("sample_sheet_match_id prefers Basename over the Sentrix array id", {
  # Basename present: it is the identity minfi assigns to the loaded samples.
  s <- data.frame(
    Sentrix_ID = c("206", "207"), Sentrix_Position = c("R01C01", "R02C01"),
    Basename = c("/jobs/x/Abcde-1234", "Abcde-1235"),  # abs + relative both handled
    stringsAsFactors = FALSE
  )
  expect_equal(sample_sheet_match_id(s), c("Abcde-1234", "Abcde-1235"))

  # No Basename: falls back to the Sentrix array id.
  s2 <- data.frame(
    Sentrix_ID = c("206", "207"), Sentrix_Position = c("R01C01", "R02C01"),
    stringsAsFactors = FALSE
  )
  expect_equal(sample_sheet_match_id(s2), c("206_R01C01", "207_R02C01"))
})

# ── align_samples_to_matrix() ─────────────────────────────────────────────────

#' Build a beta matrix + a matching Sentrix sample sheet.
mk_aligned_inputs <- function(ids = c("206_R01C01", "206_R02C01", "206_R03C01")) {
  beta <- matrix(runif(4 * length(ids)),
    nrow = 4,
    dimnames = list(paste0("cg", 1:4), ids)
  )
  parts <- do.call(rbind, strsplit(ids, "_"))
  sheet <- data.frame(
    Sample_Name = paste0("S", seq_along(ids)),
    Sentrix_ID = parts[, 1], Sentrix_Position = parts[, 2],
    Sample_Group = rep(c("A", "B"), length.out = length(ids)),
    stringsAsFactors = FALSE
  )
  list(beta = beta, sheet = sheet)
}

test_that("strict mode maps 1:1 and reorders the sheet to the matrix column order", {
  x <- mk_aligned_inputs()
  # Shuffle the sheet rows; alignment must restore the matrix column order.
  shuffled <- x$sheet[c(3, 1, 2), ]
  res <- align_samples_to_matrix(x$beta, shuffled, mode = "strict")
  expect_equal(res$method, "id")
  expect_equal(sample_sheet_array_id(res$samples), colnames(x$beta)) # reordered to beta
  expect_equal(dim(res$beta), dim(x$beta)) # matrix unchanged
})

test_that("strict mode aborts when a matrix column has no matching row", {
  x <- mk_aligned_inputs()
  sheet_missing <- x$sheet[1:2, ] # drop the 3rd sample
  expect_fatal(
    align_samples_to_matrix(x$beta, sheet_missing, mode = "strict"),
    "alignment failed"
  )
})

test_that("intersect mode keeps the shared samples and reorders consistently", {
  x <- mk_aligned_inputs()
  sheet_two <- x$sheet[1:2, ] # only 2 of 3 present
  res <- align_samples_to_matrix(x$beta, sheet_two, mode = "intersect", min_common = 2L)
  expect_equal(ncol(res$beta), 2L)
  expect_equal(sample_sheet_array_id(res$samples), colnames(res$beta))
})

test_that("intersect mode aborts below min_common shared samples", {
  x <- mk_aligned_inputs()
  sheet_one <- x$sheet[1, ] # only 1 shared
  expect_fatal(
    align_samples_to_matrix(x$beta, sheet_one, mode = "intersect", min_common = 2L),
    "matching|mismatch|minimum"
  )
})

test_that("Basename drives alignment when the Sentrix columns do not match the data", {
  # The reported bug: files are named <Basename>_{Grn,Red}.idat, so minfi names
  # the loaded samples basename(Basename). The Sentrix columns carry unrelated
  # values, so keying by Array_ID would fail; keying by Basename must succeed and
  # carry the correct groups through in the matrix's column order.
  beta <- matrix(runif(4 * 3), nrow = 4,
    dimnames = list(paste0("cg", 1:4), c("Abcde-1238", "Abcde-1234", "Abcde-1235")))
  sheet <- data.frame(
    Sample_Name = c("1", "2", "3"),
    Sentrix_ID = c("6005486014", "6005486014", "6005486021"),
    Sentrix_Position = c("R01C01", "R02C02", "R03C02"),
    Sample_Group = c("A", "A", "B"),
    Basename = c("Abcde-1234", "Abcde-1235", "Abcde-1238"),
    stringsAsFactors = FALSE
  )
  res <- align_samples_to_matrix(beta, sheet, mode = "strict")
  expect_equal(res$id_col, "Basename")
  expect_equal(res$method, "id")
  # Groups follow the beta column order (Abcde-1238=B, Abcde-1234=A, Abcde-1235=A).
  expect_equal(res$samples$Sample_Group, c("B", "A", "A"))
})

test_that("strip_idat lets IDAT-decorated matrix columns match bare sheet ids", {
  x <- mk_aligned_inputs()
  colnames(x$beta) <- paste0(colnames(x$beta), "_Grn.idat")
  res <- align_samples_to_matrix(x$beta, x$sheet, mode = "strict", strip_idat = TRUE)
  expect_equal(res$method, "id")
  expect_equal(ncol(res$beta), 3L)
})

test_that("duplicate identifiers in the chosen column are rejected", {
  # 2 matrix columns; the sheet has 3 rows, two sharing an Array_ID — both matrix
  # ids are covered (cov == 1) but the chosen id column is ambiguous, so the
  # duplicate must be rejected rather than silently mis-aligned.
  beta <- matrix(runif(4 * 2),
    nrow = 4,
    dimnames = list(paste0("cg", 1:4), c("206_R01C01", "206_R03C01"))
  )
  sheet <- data.frame(
    Sample_Name = c("S1", "S2", "S3"),
    Sentrix_ID = c("206", "206", "206"),
    Sentrix_Position = c("R01C01", "R01C01", "R03C01"), # R01C01 duplicated
    stringsAsFactors = FALSE
  )
  expect_fatal(align_samples_to_matrix(beta, sheet, mode = "strict"), "duplicate")
})

test_that("positional mode falls back to row order when no id matches", {
  beta <- matrix(runif(4 * 3), nrow = 4, dimnames = list(NULL, c("X1", "X2", "X3")))
  sheet <- data.frame(
    Sample_Name = c("a", "b", "c"), Sample_Group = c("A", "B", "A"),
    stringsAsFactors = FALSE
  ) # no Sentrix / no id match
  res <- suppressWarnings(align_samples_to_matrix(beta, sheet, mode = "positional"))
  expect_equal(res$method, "positional")
  expect_equal(nrow(res$samples), 3L)
})

test_that("alignment aborts when the sheet has fewer rows than samples (positional)", {
  beta <- matrix(runif(4 * 3), nrow = 4, dimnames = list(NULL, c("X1", "X2", "X3")))
  sheet <- data.frame(Sample_Name = c("a"), Sample_Group = "A", stringsAsFactors = FALSE)
  expect_fatal(align_samples_to_matrix(beta, sheet, mode = "positional"), "fewer rows")
})

test_that("alignment aborts on a matrix with no columns", {
  expect_fatal(
    align_samples_to_matrix(matrix(numeric(0), nrow = 2), data.frame(A = 1)),
    "no sample columns"
  )
})

# ── resolve_case_control() ────────────────────────────────────────────────────

test_that("resolve_case_control auto-picks control (sorted first) and case (second)", {
  g <- c("B", "A", "A", "B")
  res <- resolve_case_control(g, "Sample_Group", "", "")
  expect_equal(res$control, "A") # sorted first -> reference
  expect_equal(res$case, "B")
})

test_that("resolve_case_control honours explicit case/control labels", {
  g <- c("Tumor", "Normal", "Tumor")
  res <- resolve_case_control(g, "Sample_Group", case_group = "Tumor", control_group = "Normal")
  expect_equal(res$case, "Tumor")
  expect_equal(res$control, "Normal")
})

test_that("resolve_case_control requires exactly two usable groups in auto mode", {
  expect_fatal(resolve_case_control(rep("A", 4), "Sample_Group", "", ""), "usable groups")
  expect_fatal(resolve_case_control(c("A", "B", "C"), "Sample_Group", "", ""), "usable groups")
})

test_that("resolve_case_control rejects identical or absent labels", {
  g <- c("A", "B")
  expect_fatal(resolve_case_control(g, "Sample_Group", "A", "A"), "different")
  expect_fatal(resolve_case_control(g, "Sample_Group", "X", "A"), "not present")
})
