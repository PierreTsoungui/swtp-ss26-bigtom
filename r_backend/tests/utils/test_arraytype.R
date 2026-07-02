# =============================================================================
# UNIT TESTS: utils/arraytype.R
#
# Single source of truth for the Illumina array type (450K / EPIC v1 / EPIC v2):
# canonicalisation, the ChAMP arraytype mapping, persistence to array_type.txt,
# and building/loading the ChAMP `probe.features` annotation (incl. the EPIC v2
# reconstruction from the minfi manifest). normalize_arraytype()/ensure_probe_features
# call emit_error(), replaced here by a catchable condition.
# =============================================================================

library(testthat)

source("/app/r_backend/utils/progress.R")
assign("emit_error", function(message) {
  stop(structure(class = c("util_fatal", "error", "condition"),
                 list(message = as.character(message), call = NULL)))
}, envir = globalenv())
source("/app/r_backend/utils/arraytype.R")

expect_fatal <- function(expr, regexp = NULL) {
  cnd <- tryCatch({ force(expr); NULL }, util_fatal = function(c) c)
  expect_false(is.null(cnd), info = "expected a fatal emit_error() but none was raised")
  if (!is.null(regexp) && !is.null(cnd)) expect_match(conditionMessage(cnd), regexp, ignore.case = TRUE)
}

# ── normalize_arraytype() / champ_arraytype() ─────────────────────────────────

test_that("normalize_arraytype canonicalises the supported values and aliases", {
  expect_equal(normalize_arraytype("450K"), "450K")
  expect_equal(normalize_arraytype("EPIC"), "EPICv1")     # alias
  expect_equal(normalize_arraytype("850K"), "EPICv1")     # alias
  expect_equal(normalize_arraytype("EPICv1"), "EPICv1")
  expect_equal(normalize_arraytype("EPICv2"), "EPICv2")
  expect_equal(normalize_arraytype("  epicv2 "), "EPICv2")  # case + whitespace tolerant
})

test_that("normalize_arraytype rejects unknown array types", {
  expect_fatal(normalize_arraytype("UNKNOWN"), "Invalid arraytype")
})

test_that("champ_arraytype maps canonical types to ChAMP's expected strings", {
  expect_equal(champ_arraytype("450K"), "450K")
  expect_equal(champ_arraytype("EPICv1"), "EPIC")         # ChAMP uses "EPIC" for v1
  expect_equal(champ_arraytype("EPIC"), "EPIC")           # alias -> EPICv1 -> "EPIC"
  expect_equal(champ_arraytype("EPICv2"), "EPICv2")
})

# ── write_array_type() / read_array_type() ────────────────────────────────────

test_that("write_array_type persists a canonical value and read_array_type reads it back", {
  d <- tempfile("job_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  expect_true(write_array_type(d, "EPICv2"))
  expect_true(file.exists(file.path(d, ARRAY_TYPE_FILE)))
  expect_equal(read_array_type(d), "EPICv2")
})

test_that("write_array_type is a no-op for NA/empty input", {
  d <- tempfile("job_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  expect_false(write_array_type(d, NA))
  expect_false(write_array_type(d, ""))
  expect_false(file.exists(file.path(d, ARRAY_TYPE_FILE)))
})

test_that("read_array_type uses (and normalises) the fallback when the file is absent", {
  d <- tempfile("job_"); dir.create(d); on.exit(unlink(d, recursive = TRUE))
  expect_equal(read_array_type(d, fallback = "EPIC"), "EPICv1")   # alias normalised
  expect_equal(read_array_type(d, fallback = "450K"), "450K")
})

# ── detect_array_type() graceful failure ──────────────────────────────────────

test_that("detect_array_type returns NA for a non-minfi object (no annotation)", {
  # The positive path (real IDAT detection) is covered by the pipeline integration
  # test; here we assert graceful degradation rather than a crash.
  expect_true(is.na(detect_array_type(list(not = "an rgset"))))
})

# ── Registry constants ────────────────────────────────────────────────────────

test_that("the annotation registries cover every canonical array type", {
  expect_setequal(ARRAY_TYPES, c("450K", "EPICv1", "EPICv2"))
  expect_setequal(names(MINFI_ANNO_PKG), ARRAY_TYPES)
  expect_setequal(names(CHAMP_PROBE_FEATURES), ARRAY_TYPES)
})

# ── probe.features loading / reconstruction (heavy: needs ChAMPdata / minfi) ───

test_that("load_probe_features loads the ChAMPdata annotation for 450K / EPIC v1", {
  skip_if_not(requireNamespace("ChAMPdata", quietly = TRUE), "ChAMPdata not installed")
  pf450 <- load_probe_features("450K")
  expect_s3_class(pf450, "data.frame")
  expect_true(all(c("CHR", "MAPINFO") %in% colnames(pf450)))
  expect_gt(nrow(pf450), 0L)

  pfepic <- load_probe_features("EPICv1")     # ChAMPdata "probe.features.epic"
  expect_s3_class(pfepic, "data.frame")
  expect_gt(nrow(pfepic), 0L)
})

test_that("build_probe_features_minfi reconstructs an EPIC v2 probe.features table", {
  skip_if_not(requireNamespace("IlluminaHumanMethylationEPICv2anno.20a1.hg38", quietly = TRUE),
              "EPIC v2 minfi annotation not installed")
  pf <- build_probe_features_minfi("EPICv2")
  expect_s3_class(pf, "data.frame")
  expect_true(all(c("CHR", "MAPINFO", "gene", "feature", "cgi") %in% colnames(pf)))
  expect_gt(nrow(pf), 5e5L)                            # ~930k probes
  expect_false(any(grepl("^chr", pf$CHR)))            # "chr" prefix stripped
})

test_that("ensure_probe_features binds a global probe.features for EPIC v2", {
  skip_if_not(requireNamespace("IlluminaHumanMethylationEPICv2anno.20a1.hg38", quietly = TRUE),
              "EPIC v2 minfi annotation not installed")
  if (exists("probe.features", envir = globalenv())) rm("probe.features", envir = globalenv())
  pf <- ensure_probe_features("EPICv2")
  expect_true(exists("probe.features", envir = globalenv()))
  expect_true(is.data.frame(get("probe.features", envir = globalenv())))
  expect_gt(nrow(pf), 0L)
})
