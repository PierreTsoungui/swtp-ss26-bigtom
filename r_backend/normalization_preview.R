# ------------------------------------------------------------
# LIBRARIES
# ------------------------------------------------------------
library(minfi)
library(ggplot2)

# ------------------------------------------------------------
# CHECK INPUT
# ------------------------------------------------------------
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 1) {
  stop("Usage: Rscript normalization_preview.R <filtered_data.rds>")
}

rds_path <- args[1]

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

    make_density_plot(
      result,
      filename,
      name
    )

  }, error = function(e) {

    cat("ERROR in", name, ":", e$message, "\n")

    create_error_png(
      filename,
      e$message
    )
  })

  cat(paste0("PROGRESS:", progress, "\n"))
  flush.console()
}

# ------------------------------------------------------------
# RAW
# ------------------------------------------------------------
run_method(
  "RAW",
  quote(preprocessRaw(data)),
  "/data/norm_raw.png",
  20
)

# ------------------------------------------------------------
# NOOB
# ------------------------------------------------------------
run_method(
  "NOOB",
  quote(preprocessNoob(data)),
  "/data/norm_noob.png",
  40
)

# ------------------------------------------------------------
# QUANTILE
# ------------------------------------------------------------
run_method(
  "QUANTILE",
  quote(preprocessQuantile(data)),
  "/data/norm_quantile.png",
  60
)

# ------------------------------------------------------------
# SWAN
# ------------------------------------------------------------
tryCatch({

  cat("Running: SWAN\n")

  stop("SWAN requires RGChannelSet input")

}, error = function(e) {

  cat("ERROR SWAN:", e$message, "\n")

  create_error_png(
    "/data/norm_swan.png",
    e$message
  )

})

cat("PROGRESS:80\n")
flush.console()

# ------------------------------------------------------------
# FUNNORM
# ------------------------------------------------------------
run_method(
  "FUNNORM",
  quote(preprocessFunnorm(data)),
  "/data/norm_funnorm.png",
  100
)

cat("=== NORMALIZATION FINISHED ===\n")