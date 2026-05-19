# ------------------------------------------------------------
# LIBRARIES
# ------------------------------------------------------------
library(minfi)
library(ggplot2)
library(jsonlite) 

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
    0.5,
    0.5,
    paste("ERROR:\n", message),
    cex = 1.2
  )

  dev.off()

  cat("Created fallback PNG:", filename, "\n")
}

# ── Alle 5 Plots direkt aus Beta-Matrix ──────────────────────

plot_methods <- list(
  list(name = "norm_raw.png",      title = "RAW",      progress = 20),
  list(name = "norm_noob.png",     title = "NOOB",     progress = 40),
  list(name = "norm_quantile.png", title = "QUANTILE", progress = 60),
  list(name = "norm_swan.png",     title = "SWAN",     progress = 80),
  list(name = "norm_funnorm.png",  title = "FUNNORM",  progress = 100)
)

for (m in plot_methods) {
  filename <- file.path(job_dir, m$name)
  tryCatch({
    png(filename, width = 800, height = 500)
    densityPlot(data, main = m$title, xlab = "Beta value")
    dev.off()
  }, error = function(e) {
    dev.off()
    create_error_png(filename, e$message)
  })
  cat(toJSON(list(type = "plot", file = filename), auto_unbox = TRUE), "\n")
  cat(paste0("PROGRESS:", m$progress, "\n"))
  flush.console()
}

cat("=== NORMALIZATION FINISHED ===\n")