#!/usr/bin/env Rscript
# r_backend/normalization_preview.R
#
#' Normalization preview for the methylation-analysis pipeline.
#'
#' Loads the filtered \code{RGChannelSet} produced by \code{init_filter.R}, runs
#' several normalization methods (RAW, NOOB, QUANTILE, SWAN, FUNNORM) and, per
#' method, writes a density plot (PNG for inline display + vector PDF for export)
#' and the PCA point coordinates (sample, group, PC1/PC2) as JSON, from which the
#' frontend renders an INTERACTIVE plot (dynamic colouring by group, label
#' toggle, client-side export) — see NRM-03/NRM-04.
#'
#' @section Array support:
#' Array-agnostic: minfi detects the platform from the data, so 450K, EPIC v1 and
#' EPIC v2 are all supported without special handling.
#'
#' @section Customer requirements:
#' \enumerate{
#'   \item Density plot per method (PNG + PDF).
#'   \item PCA as JSON points: each sample one point, PC1 vs PC2, outliers visible.
#'   \item EPIC v2 support.
#'   \item No automatic recommendation.
#' }
#'
#' @section Usage:
#' \code{Rscript normalization_preview.R <filtered_data.rds> <job_dir> <sample_sheet.csv>}
#'
#' @section Output (per method \code{<m>}, written to \code{job_dir}):
#' \code{density_<m>.png} / \code{density_<m>.pdf} (static density plot) and
#' \code{pca_<m>.json} (PCA points for the interactive plotter).
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON.
#'
#' @section Testability:
#' All functions are defined at the top level; the pipeline runs only when the
#' file is executed as a script (Rscript). When sourced for unit testing,
#' \code{sys.nframe() > 0}, so the run guard at the bottom is skipped and only the
#' function definitions are loaded.


# ── Environment setup ─────────────────────────────────────────────────────────
# Single-threaded, serial, reproducible execution (see utils/runtime.R);
# normalization (e.g. preprocessFunnorm) dispatches to parallel backends.
source("/app/r_backend/utils/runtime.R")
configure_runtime()

# ── Libraries ─────────────────────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
  library(BiocParallel)
})

# Shared progress / error / done emitters.
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/beta.R")
source("/app/r_backend/utils/plotting.R")
# sample_sheet_match_id(): the single source of truth for how a sample-sheet row
# is keyed to a loaded-data column (Basename vs. Sentrix array id).
source("/app/r_backend/utils/samplesheet.R")


# ── Constants ─────────────────────────────────────────────────────────────────
# EPICv2 memory guard: cap the number of probes fed into PCA.
MAX_PROBES_FOR_PCA <- 500000


# ── Sample sheet ──────────────────────────────────────────────────────────────

#' Read a sample sheet (plain CSV or Illumina \[Data\] CSV).
#'
#' Detects an Illumina \code{[Data]} header and skips the preamble.
#'
#' @param path Path to the sample sheet file.
#' @return A \code{data.frame} with the sample sheet contents.
read_sample_sheet <- function(path) {
  if (!file.exists(path)) {
    emit_error("The sample sheet could not be found.")
  }
  lines <- tryCatch(
    readLines(path, warn = FALSE),
    error = function(e) emit_error("The sample sheet could not be read. Please check the file.")
  )
  data_start <- grep("^\\[Data\\]", lines)
  skip_n <- if (length(data_start) > 0) data_start[1] else 0

  tryCatch(
    read.csv(path, skip = skip_n, stringsAsFactors = FALSE, check.names = FALSE),
    error = function(e) {
      emit_error("The sample sheet could not be read. Please check that the file exists and is not corrupted.")
    }
  )
}


# ── Plot rendering helpers ────────────────────────────────────────────────────

# render_png_and_pdf() (safe PNG + vector-PDF output) is provided by
# utils/plotting.R.

#' Render an error placeholder (as PNG + PDF) for a failed density plot.
#'
#' @param filename Output PNG path.
#' @param message Error message to display.
#' @param method Method name (for context; unused in the drawing).
#' @param plot_kind Plot type label (e.g. "density"; for context).
#' @return Invisibly \code{NULL}.
create_error_png <- function(filename, message, method, plot_kind) {
  render_png_and_pdf(
    filename,
    draw_fn = function() {
      plot.new()
      text(0.5, 0.5, paste("ERROR:\n", message), cex = 1.3, col = "red")
    },
    width = 800,
    height = 500,
    res = 96
  )
}

#' Create a density plot from a beta-value matrix (PNG + PDF).
#'
#' Rendered larger and at higher resolution than the screen default because
#' biologists print/screenshot the plots — axes and labels must stay legible in
#' print (NRM-02).
#'
#' @param beta_values Beta-value matrix (probes x samples).
#' @param filename Output PNG path (the PDF is derived automatically).
#' @param title Plot title.
#' @return Invisibly \code{NULL}.
make_density_plot <- function(beta_values, filename, title) {
  render_png_and_pdf(
    filename,
    draw_fn = function() {
      par(mar = c(5, 5, 4, 2))
      densityPlot(
        beta_values,
        main     = title,
        xlab     = "Beta value",
        legend   = FALSE,
        cex.main = 1.8,
        cex.lab  = 1.5,
        cex.axis = 1.3,
        lwd      = 2.5
      )
    },
    width = 1000,
    height = 650,
    res = 120
  )
}


# ── PCA -> JSON ───────────────────────────────────────────────────────────────
# Instead of a finished PNG we write the PCA point coordinates plus metadata
# (sample name, group) as JSON. The frontend renders an interactive plot from it
# (dynamic colours, label toggle, client-side PNG export) — see NRM-03/NRM-04.
# Density plots stay PNG/PDF because they are not interactive.

#' Compute a PCA and write its points to JSON.
#'
#' Drops non-finite values, removes incomplete and (near-)zero-variance probes,
#' optionally subsamples very large matrices, then writes PC1/PC2 per sample with
#' the variance explained. Column (sample) order is preserved throughout, so the
#' supplied labels/groups stay aligned to \code{pca$x}.
#'
#' @param beta_values Beta-value matrix (probes x samples).
#' @param filename Output JSON path.
#' @param method_name Normalization method name (stored in the payload).
#' @param sample_labels Optional per-sample labels (length = number of samples).
#' @param sample_groups Optional per-sample group/phenotype labels.
#' @return Invisibly \code{NULL}; writes \code{filename}.
write_pca_json <- function(beta_values, filename, method_name,
                           sample_labels = NULL, sample_groups = NULL) {
  if (is.null(beta_values) || ncol(beta_values) < 3) {
    stop("PCA requires at least 3 samples")
  }

  # Drop non-finite and (near-)constant probes (var > 1e-6 <=> sd > 1e-3).
  beta_values <- drop_invariant_probes(beta_values, min_sd = 1e-3, require_finite = TRUE)

  if (nrow(beta_values) < 10) stop("Not enough valid CpGs remaining for PCA")
  if (ncol(beta_values) < 2) stop("Not enough samples for PCA")

  if (nrow(beta_values) > MAX_PROBES_FOR_PCA) {
    set.seed(123)
    idx <- sample(seq_len(nrow(beta_values)), MAX_PROBES_FOR_PCA)
    beta_values <- beta_values[idx, , drop = FALSE]
  }

  pca <- prcomp(t(beta_values), center = TRUE, scale. = FALSE)
  var_exp <- round((pca$sdev^2 / sum(pca$sdev^2)) * 100, 1)

  n <- ncol(beta_values)

  # Labels: use the parameter, else column names, else a generic fallback.
  labels_to_use <- if (!is.null(sample_labels) && length(sample_labels) == n) {
    sample_labels
  } else if (!is.null(colnames(beta_values))) {
    colnames(beta_values)
  } else {
    paste0("Sample_", seq_len(n))
  }

  groups_to_use <- if (!is.null(sample_groups) && length(sample_groups) == n) {
    as.character(sample_groups)
  } else {
    rep("", n)
  }
  groups_to_use[is.na(groups_to_use)] <- ""

  points <- lapply(seq_len(n), function(i) {
    list(
      sample = labels_to_use[i],
      group  = groups_to_use[i],
      pc1    = round(unname(pca$x[i, 1]), 4),
      pc2    = round(unname(pca$x[i, 2]), 4)
    )
  })

  payload <- list(
    method             = method_name,
    axes               = list(x = "PC1", y = "PC2"),
    variance_explained = list(pc1 = var_exp[1], pc2 = var_exp[2]),
    points             = points
  )

  jsonlite::write_json(payload, path = filename, auto_unbox = TRUE, pretty = TRUE)
  invisible(NULL)
}

#' Write a PCA JSON that carries only an error.
#'
#' Lets the frontend show a clear per-method message instead of an empty plot.
#'
#' @param filename Output JSON path.
#' @param method_name Normalization method name.
#' @param message Error message.
#' @return Invisibly \code{NULL}.
write_pca_error_json <- function(filename, method_name, message) {
  jsonlite::write_json(
    list(method = method_name, error = message, points = list()),
    path = filename, auto_unbox = TRUE, pretty = TRUE
  )
  invisible(NULL)
}


# ── Run one method ────────────────────────────────────────────────────────────

#' Run a single normalization method and produce its preview artifacts.
#'
#' Normalizes, extracts beta values, then writes the density plot (PNG + PDF) and
#' the PCA points (JSON). Every stage is wrapped defensively: a failure in one
#' method writes an error placeholder and never aborts the whole preview.
#'
#' Reads \code{job_dir}, \code{id_to_name} and \code{id_to_group} from the calling
#' (global) scope, which the run guard populates before invoking this function.
#'
#' @param method_name Display name of the method (also used for file names).
#' @param normalization_expr A quoted expression returning a normalized object.
#' @param base_pct Starting progress percentage for this method.
#' @return Invisibly \code{NULL}.
run_method <- function(method_name, normalization_expr, base_pct) {
  density_filename <- file.path(job_dir, paste0("density_", tolower(method_name), ".png"))
  pca_filename <- file.path(job_dir, paste0("pca_", tolower(method_name), ".json"))

  emit_progress(base_pct, paste0("Running preview for method: ", method_name))

  normalized <- NULL
  beta <- NULL

  tryCatch(
    {
      # Normalization + beta extraction.
      normalized <- eval(normalization_expr)
      beta <- extract_beta(normalized)

      # Map array ids to sample names and groups for the PCA payload.
      array_ids <- colnames(beta)
      sample_labels <- ifelse(array_ids %in% names(id_to_name), id_to_name[array_ids], array_ids)
      sample_groups <- ifelse(array_ids %in% names(id_to_group), id_to_group[array_ids], "")

      # Density plot (PNG + PDF).
      tryCatch(
        {
          emit_progress(base_pct + 3, paste0(method_name, ": generating density plot..."))
          make_density_plot(beta, density_filename, method_name)
        },
        error = function(e) {
          emit_progress(base_pct + 3, paste0("Density plot failed for ", method_name))
          create_error_png(density_filename, conditionMessage(e), method_name, "density")
        }
      )

      # PCA points (JSON).
      tryCatch(
        {
          emit_progress(base_pct + 6, paste0(method_name, ": generating PCA data (JSON)..."))
          write_pca_json(
            beta, pca_filename, method_name,
            sample_labels = sample_labels,
            sample_groups = sample_groups
          )
        },
        error = function(e) {
          emit_progress(base_pct + 6, paste0("PCA failed for ", method_name))
          write_pca_error_json(pca_filename, method_name, conditionMessage(e))
        }
      )

      rm(normalized, beta)
    },
    error = function(e) {
      # Whole-method failure (e.g. normalization itself): emit placeholders so the
      # frontend shows a clear message for this method and the rest still run.
      emit_progress(base_pct + 8, paste0("Error in method ", method_name, ": ", conditionMessage(e)))
      create_error_png(density_filename, paste("Normalization failed:", conditionMessage(e)), method_name, "density")
      write_pca_error_json(pca_filename, method_name, paste("Normalization failed:", conditionMessage(e)))
    }
  )

  gc(verbose = FALSE, full = TRUE)
  invisible(NULL)
}


# ── Main pipeline (run only as a script, not when sourced for tests) ───────────
if (sys.nframe() == 0L) {
  # ── Input check ─────────────────────────────────────────────────────────────
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) < 3) {
    emit_error("Usage: Rscript normalization_preview.R <filtered_data.rds> <job_dir> <sample_sheet.csv>")
  }
  rds_path <- args[1]
  job_dir <- args[2]
  sample_sheet_path <- args[3]

  # ── Load filtered data ──────────────────────────────────────────────────────
  emit_progress(2, "Loading filtered data...")
  if (!file.exists(rds_path)) {
    emit_error("The analysis data could not be found. Please ensure the previous filtering step completed successfully.")
  }
  filtered_rgset <- tryCatch(
    readRDS(rds_path),
    error = function(e) {
      emit_error("The analysis data could not be read. Please ensure the file is not damaged.")
    }
  )
  # All preview methods (NOOB/QUANTILE/SWAN/FUNNORM) require the raw channel data,
  # so reject anything that is not an RGChannelSet with a clear message instead of
  # letting every method fail downstream.
  if (!methods::is(filtered_rgset, "RGChannelSet")) {
    emit_error("The filtered data has an unexpected format (expected an RGChannelSet). Please re-run the filtering step.")
  }
  emit_progress(4, "Filtered data loaded successfully")

  # ── Load sample sheet ───────────────────────────────────────────────────────
  emit_progress(5, "Loading sample sheet...")
  sample_sheet <- read_sample_sheet(sample_sheet_path)

  # The beta-matrix columns are named after the identity minfi gives each loaded
  # sample: basename(Basename) when the sheet uses the alternative IDAT-naming
  # convention, otherwise Sentrix_ID_Sentrix_Position. Key the lookups by that
  # same identity so the group/name attach correctly (otherwise every PCA point
  # loses its group and is rendered grey). Requires one of the two id sources.
  sample_key <- sample_sheet_match_id(sample_sheet)
  if (all(is.na(sample_key))) {
    emit_error(paste(
      "Sample sheet must contain a 'Basename' column or both",
      "'Sentrix_ID' and 'Sentrix_Position' to link samples to the data."
    ))
  }

  # Lookup tables: match-id -> Sample_Name and match-id -> Sample_Group. The group
  # (phenotype) is attached to every PCA point so the frontend can colour the
  # points dynamically by group (NRM-03).
  id_to_name <- if ("Sample_Name" %in% colnames(sample_sheet)) {
    setNames(as.character(sample_sheet$Sample_Name), sample_key)
  } else {
    setNames(sample_key, sample_key)
  }
  id_to_group <- if ("Sample_Group" %in% colnames(sample_sheet)) {
    setNames(as.character(sample_sheet$Sample_Group), sample_key)
  } else {
    setNames(character(0), character(0))
  }

  # ── Data information ────────────────────────────────────────────────────────
  n_samples <- ncol(filtered_rgset)
  n_probes <- nrow(filtered_rgset)
  emit_progress(6, paste0("Data loaded - Samples: ", n_samples, ", Probes: ", n_probes))

  # ── Execute all normalization methods ───────────────────────────────────────
  # RAW is included as an unnormalized baseline for comparison (NRM-01).
  run_method("RAW", quote(preprocessRaw(filtered_rgset)), base_pct = 10)
  run_method("NOOB", quote(preprocessNoob(filtered_rgset)), base_pct = 28)
  run_method("QUANTILE", quote(preprocessQuantile(filtered_rgset)), base_pct = 46)

  run_method("SWAN", quote({
    # preprocessSWAN randomly subsets probes — seed it for a reproducible preview.
    set.seed(42)
    mset_raw <- preprocessRaw(filtered_rgset)
    preprocessSWAN(filtered_rgset, mset_raw)
  }), base_pct = 64)

  run_method("FUNNORM", quote({
    # nPCs must stay below the sample count; clamp for small cohorts.
    n_pcs <- min(2, max(1, ncol(filtered_rgset) - 1))
    preprocessFunnorm(filtered_rgset, nPCs = n_pcs)
  }), base_pct = 82)

  # ── Done ──────────────────────────────────────────────────────────────────
  emit_progress(100, "Normalization preview completed successfully")
  emit_done()
}
