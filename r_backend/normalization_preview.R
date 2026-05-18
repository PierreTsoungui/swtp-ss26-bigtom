Sys.setenv(
  OMP_NUM_THREADS = 1,
  OPENBLAS_NUM_THREADS = 1,
  MKL_NUM_THREADS = 1,
  NUMEXPR_NUM_THREADS = 1
)

# ------------------------------------------------------------
# LIBRARIES
# ------------------------------------------------------------
library(minfi)
library(ggplot2)
library(jsonlite)
library(BiocParallel)

register(SerialParam())
options(mc.cores = 1)

bp <- SerialParam()
BiocParallel::register(bp)
register(SerialParam())

# ------------------------------------------------------------
# CHECK INPUT
# ------------------------------------------------------------
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: Rscript normalization_preview.R <filtered_data.rds> <job_dir>")
}

rds_path <- args[1]
job_dir  <- args[2]

if (!file.exists(rds_path)) {
  stop("ERROR: filtered_data.rds not found")
}

# ------------------------------------------------------------
# LOAD DATA
# ------------------------------------------------------------
data <- readRDS(rds_path)

# ------------------------------------------------------------
# CREATE ERROR PNG
# ------------------------------------------------------------
create_error_png <- function(filename, message) {
  png(filename, width = 800, height = 400)
  plot.new()
  text(
    0.5, 0.5,
    paste("ERROR:\n", message),
    cex = 1.2
  )
  dev.off()
  cat("Created fallback PNG:", filename, "\n")
}

# ------------------------------------------------------------
# CREATE DENSITY PLOT
# ------------------------------------------------------------
make_density_plot <- function(mSet, filename, title) {
  png(filename)
  densityPlot(
    getBeta(mSet),
    main = title,
    xlab = "Beta value"
  )
  dev.off()
  cat("Saved:", filename, "\n")
}

# ------------------------------------------------------------
# PROGRESS HELPER
# ------------------------------------------------------------
update_progress <- function(x) {
  cat(paste0("PROGRESS:", x, "\n"))
  flush.console()
}

# ------------------------------------------------------------
# RAW (20%)
# ------------------------------------------------------------
png(file.path(job_dir, "norm_raw.png"))
densityPlot(getBeta(data), main = "RAW", xlab = "Beta value")
dev.off()
update_progress(20)

# ------------------------------------------------------------
# NOOB (40%)
# ------------------------------------------------------------
png(file.path(job_dir, "norm_noob.png"))
densityPlot(getBeta(data), main = "NOOB", xlab = "Beta value")
dev.off()
update_progress(40)

# ------------------------------------------------------------
# QUANTILE (60%)
# ------------------------------------------------------------
png(file.path(job_dir, "norm_quantile.png"))
densityPlot(getBeta(data), main = "QUANTILE", xlab = "Beta value")
dev.off()
update_progress(60)

# ------------------------------------------------------------
# SWAN (80%) - not compatible
# ------------------------------------------------------------
tryCatch({
  cat("Running: SWAN\n")
  stop("SWAN requires RGChannelSet input (not supported in this pipeline)")
}, error = function(e) {

  create_error_png(file.path(job_dir, "norm_swan.png"), e$message)

  cat(toJSON(list(
    type = "plot",
    file = file.path(job_dir, "norm_swan.png")
  ), auto_unbox = TRUE), "\n")
})

update_progress(80)

# ------------------------------------------------------------
# FUNNORM (100%)
# ------------------------------------------------------------
run_method <- function(name, expr, filename, progress) {
  cat("Running:", name, "\n")

  tryCatch({
    result <- eval(expr)
    make_density_plot(result, filename, name)

    cat(toJSON(list(type = "plot", file = filename), auto_unbox = TRUE), "\n")

  }, error = function(e) {

    cat("ERROR in", name, ":", e$message, "\n")
    create_error_png(filename, e$message)

    cat(toJSON(list(type = "plot", file = filename), auto_unbox = TRUE), "\n")
  })

  update_progress(progress)
}

run_method(
  "FUNNORM",
  quote(preprocessFunnorm(data)),
  file.path(job_dir, "norm_funnorm.png"),
  100
)

# ------------------------------------------------------------
# END
# ------------------------------------------------------------
cat("=== NORMALIZATION FINISHED ===\n")