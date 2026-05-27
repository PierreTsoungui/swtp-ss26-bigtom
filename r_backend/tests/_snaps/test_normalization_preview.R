library(testthat)

job_dir <- "/app/jobs/3a0a1a43-298f-40e5-b0b0-efb16d2c0a7e"

files <- c(
  "norm_raw.png",
  "norm_noob.png",
  "norm_quantile.png",
  "norm_swan.png",
  "norm_funnorm.png"
)

# ------------------------------------------------------------
# TEST: all PNGs exist
# ------------------------------------------------------------
test_that("all PNGs exist after execution", {

  for (f in files) {
    path <- file.path(job_dir, f)
    expect_true(file.exists(path), info = paste("Missing:", f))
  }
})

# ------------------------------------------------------------
# TEST: PNGs are valid (>0 bytes)
# ------------------------------------------------------------
test_that("PNGs are valid (>0 bytes)", {

  for (f in files) {
    path <- file.path(job_dir, f)
    expect_true(file.exists(path) && file.size(path) > 0,
                info = paste("Invalid PNG:", f))
  }
})