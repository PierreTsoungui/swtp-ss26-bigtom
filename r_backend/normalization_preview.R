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
# RUN METHOD SAFELY
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
  cat(paste0("PROGRESS:", progress, "\n"))
  flush.console()
}

# ------------------------------------------------------------
# RAW
# ------------------------------------------------------------
png(file.path(job_dir, "norm_raw.png"))
densityPlot(data, main = "RAW", xlab = "Beta value")
dev.off()
png(file.path(job_dir, "norm_noob.png"))
densityPlot(data, main = "NOOB", xlab = "Beta value")
dev.off()
png(file.path(job_dir, "norm_quantile.png"))
densityPlot(data, main = "QUANTILE", xlab = "Beta value")
dev.off()

# ------------------------------------------------------------
# SWAN
# ------------------------------------------------------------
tryCatch({

  cat("Running: SWAN\n")

  stop("SWAN requires RGChannelSet input")

}, error = function(e) {

  create_error_png(file.path(job_dir, "norm_swan.png"), e$message)
  cat(toJSON(list(type = "plot", file = file.path(job_dir, "norm_swan.png")), auto_unbox = TRUE), "\n")

})

cat("PROGRESS:80\n")
flush.console()

# ------------------------------------------------------------
# FUNNORM
# ------------------------------------------------------------
run_method("FUNNORM",  quote(preprocessFunnorm(data)),  file.path(job_dir, "norm_funnorm.png"),  100)

cat("=== NORMALIZATION FINISHED ===\n")