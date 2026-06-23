# r_backend/utils/samplesheet.R
#
# Single source of truth for HOW the backend reads an Illumina sample sheet and,
# crucially, WHAT the column names are. The Python column detection
# (get_available_columns_from_samplesheet) and every R script must agree on the
# raw column names exactly as they appear in the sheet's [Data] section
# (Sample_Group, Sentrix_ID, Sentrix_Position, ...).
#
# IMPORTANT: do NOT read sample sheets via minfi::read.metharray.sheet() for
# metadata. It renames Sentrix_ID -> Slide and Sentrix_Position -> Array, which
# breaks the contract above: a batch variable the API offers ("Sentrix_Position")
# would then be invisible to the R script.

suppressPackageStartupMessages(library(readr))


#' Reads the [Data] section of a sample sheet, preserving the original column
#' names. Skips the [Header] block so the data column row becomes the header.
#'
#' @param path Path to the SampleSheet CSV.
#' @return A data.frame with the raw sample-sheet columns.
read_sample_sheet_smart <- function(path) {
  lines      <- readLines(path, warn = FALSE)
  data_start <- grep("^\\[Data\\]", lines)
  skip_n     <- if (length(data_start) > 0) data_start[1] else 0
  as.data.frame(read_csv(path, skip = skip_n, show_col_types = FALSE))
}


#' Normalizes an identifier for robust matching by stripping all whitespace.
#'
#' @param x A character vector (or coercible).
#' @return The cleaned character vector.
normalize_id <- function(x) {
  x <- as.character(x)
  x <- gsub("[[:space:]]+", "", x)
  x <- gsub("\r|\n|\t", "", x)
  x
}


#' Builds the combined array id (chip + position) used to match sample-sheet
#' rows to beta-matrix columns, e.g. "206891110001_R01C01".
#'
#' @param samples A data.frame from read_sample_sheet_smart().
#' @return A character vector of array ids.
sample_sheet_array_id <- function(samples) {
  paste0(samples$Sentrix_ID, "_", samples$Sentrix_Position)
}
