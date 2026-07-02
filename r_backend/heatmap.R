#!/usr/bin/env Rscript
# r_backend/heatmap.R
#
#' Heatmap rendering for DMP/DMR results.
#'
#' Renders a methylation heatmap (PNG for inline display + vector PDF for
#' download) from a DMP/DMR result table, restricted to the CpGs the user
#' selected in the table (single filter source). Samples are annotated by one or
#' two grouping columns and the figure is auto-sized so labels, dendrograms and
#' legends are never clipped.
#'
#' @section Array support:
#' Array-agnostic. It operates purely on a numeric beta matrix (taken from
#' \code{beta.rds} or from group-average columns of the result table) plus the
#' sample sheet, so 450K, EPIC v1 and EPIC v2 data are all supported without any
#' array-specific handling.
#'
#' @section Usage:
#' \code{Rscript heatmap.R <result.rds> <sample_sheet.csv> <job_dir>}
#'
#' @section Configuration (environment variables):
#' \describe{
#'   \item{HEATMAP_GROUP1}{Primary annotation column (auto-selected if empty).}
#'   \item{HEATMAP_GROUP2}{Optional secondary annotation column.}
#'   \item{HEATMAP_MAX_ROWS}{Hard row limit (default 1000).}
#'   \item{HEATMAP_OUTPUT}{Output PNG name (default \code{heatmap.png}); the PDF
#'     is derived from it.}
#'   \item{HEATMAP_INPUT}{CSV of selected CpG ids written by the backend
#'     (default \code{heatmap_input.csv}).}
#' }
#'
#' @section Output:
#' \code{<job_dir>/<HEATMAP_OUTPUT>} (PNG) and the matching \code{.pdf}.
#'
#' @section Progress protocol:
#' Progress/errors are emitted via \code{utils/progress.R} as single-line JSON.


# ── Environment setup ─────────────────────────────────────────────────────────
# Single-threaded, serial, reproducible execution (see utils/runtime.R);
# clustering (dist/hclust) can use BLAS.
source("/app/r_backend/utils/runtime.R")
configure_runtime()

# ── Packages ──────────────────────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(jsonlite)
  library(ComplexHeatmap)
  library(circlize)
  library(readr)
  library(grid)
})

# Shared progress emitters, column helpers (get_col_ci / has_col_ci), beta
# helpers (extract_beta), plotting (render_png_and_pdf) and annotation helpers
# (build_colours / make_anno_spec).
source("/app/r_backend/utils/progress.R")
source("/app/r_backend/utils/columns.R")
source("/app/r_backend/utils/beta.R")
source("/app/r_backend/utils/plotting.R")
source("/app/r_backend/utils/heatmap_anno.R")

TOTAL_STEPS <- 8L
curr_pct    <- 0L  # Tracks the current global percentage for sub-step messages.

# ── Main execution (run only as a script) ────────────────────────────────────
# Run only when executed as a script (Rscript). When source()d/sys.source()d for
# unit testing, sys.nframe() > 0, so the pipeline does not auto-run — the reusable
# annotation helpers live in utils/heatmap_anno.R and are tested there.
if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)

  if (length(args) != 3L) {
    emit_error("Usage: Rscript heatmap.R <result.rds> <sample_sheet.csv> <job_dir>")
  }

  result_rds <- args[1]
  sheet_path <- args[2]
  job_dir    <- args[3]

  group1   <- Sys.getenv("HEATMAP_GROUP1", unset = "")
  group2   <- Sys.getenv("HEATMAP_GROUP2", unset = "")
  max_rows <- suppressWarnings(
    as.integer(Sys.getenv("HEATMAP_MAX_ROWS", unset = "1000"))
  )
  out_file   <- Sys.getenv("HEATMAP_OUTPUT", unset = "heatmap.png")
  input_file <- Sys.getenv("HEATMAP_INPUT",  unset = "heatmap_input.csv")

  if (is.na(max_rows) || max_rows < 1L) {
    emit_error("HEATMAP_MAX_ROWS must be a positive integer")
  }

  group1_set    <- nzchar(trimws(group1))
  group2_active <- nzchar(trimws(group2))

  # ── Step 1 – Validate files & ensure job_dir exists ───────────────────────────
  curr_pct <- as.integer(round(1L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Validating inputs and preparing job directory")

  if (!file.exists(result_rds)) {
    emit_error(paste("result.rds not found:", result_rds))
  }
  if (!file.exists(sheet_path)) {
    emit_error(paste("sample_sheet.csv not found:", sheet_path))
  }
  if (!dir.exists(job_dir)) {
    emit_error("job_dir does not exist")
  }

  output_path <- file.path(job_dir, out_file)
  pdf_path    <- file.path(job_dir, paste0(tools::file_path_sans_ext(out_file), ".pdf"))

  # ── Step 2 – Load DMP/DMR table ───────────────────────────────────────────────
  curr_pct <- as.integer(round(2L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Loading DMP/DMR results")

  dmp <- tryCatch({
    obj <- readRDS(result_rds)
    if (is.list(obj) && !is.data.frame(obj)) obj <- obj[[1]]
    if (!is.data.frame(obj))
      emit_error("result.rds does not contain a data.frame")
    obj
  }, error = function(e) {
    emit_error(paste("Failed to load result.rds:", conditionMessage(e)))
  })

  if (nrow(dmp) == 0L)
    emit_error("DMP/DMR table is empty – nothing to visualise")

  # Normalise column names
  colnames(dmp) <- trimws(colnames(dmp))
  col_upper      <- toupper(colnames(dmp))

  # Helpers get_col_ci() / has_col_ci() are provided by utils/columns.R.

  # Promote "ID" column to rownames if numeric indices
  cpg_ids <- rownames(dmp)
  if (all(grepl("^[0-9]+$", cpg_ids))) {
    id_col <- which(col_upper %in% c("ID", "CPG_ID", "PROBE_ID", "PROBEID"))
    if (length(id_col) > 0L) {
      rownames(dmp) <- as.character(dmp[[id_col[1L]]])
      cpg_ids       <- rownames(dmp)
      emit_progress(curr_pct, paste("Rownames promoted from column:", colnames(dmp)[id_col[1L]]))
    } else {
      emit_progress(curr_pct, "Warning: rownames are numeric indices; no ID column found to replace them.")
    }
  }

  if (is.null(cpg_ids) || any(!nzchar(cpg_ids)))
    emit_error("DMP/DMR table has no valid rownames (expected CpG/DMR IDs)")

  emit_progress(curr_pct, paste("DMP/DMR table loaded:", nrow(dmp), "rows"))

  # ── Step 2b – Restrict to the CpGs selected in the table (single filter source)
  # Filtering happens ONCE in the backend (table_filter.apply_filters). The backend
  # writes the chosen CpG IDs to heatmap_input.csv; here we only subset to them, so
  # the heatmap is guaranteed to match the table view. See heatmap-konzept.md §3.
  input_path <- file.path(job_dir, input_file)
  if (!file.exists(input_path))
    emit_error(paste0("Heatmap input not found: ", input_path,
                      " – the backend must write the filtered CpG list."))

  selection <- tryCatch(
    read_csv(input_path, show_col_types = FALSE),
    error = function(e) emit_error(paste("Failed to read heatmap input:", conditionMessage(e)))
  )
  sel_id_col   <- if ("ID" %in% colnames(selection)) "ID" else colnames(selection)[1]
  selected_ids <- unique(as.character(selection[[sel_id_col]]))
  selected_ids <- selected_ids[nzchar(selected_ids)]
  if (length(selected_ids) == 0L)
    emit_error("Heatmap input contains no CpG IDs.")

  rows_before <- nrow(dmp)
  keep <- rownames(dmp) %in% selected_ids
  if (has_col_ci(dmp, "ID")) {
    keep <- keep | (as.character(get_col_ci(dmp, "ID")) %in% selected_ids)
  }
  dmp <- dmp[keep, , drop = FALSE]

  emit_progress(curr_pct, paste0("Filtered CpG selection applied: ", rows_before, " → ", nrow(dmp), " rows"))

  if (nrow(dmp) == 0L)
    emit_error("None of the selected CpGs were found in the DMP results. Please regenerate the analysis.")

  # ── Step 3 – Row limit ────────────────────────────────────────────────────────
  curr_pct <- as.integer(round(3L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Checking row count against limit")

  if (nrow(dmp) > max_rows) {
    emit_error(
      paste0("Too many rows for heatmap: ", nrow(dmp), " entries. ",
             "Hard limit is ", max_rows, ". ",
             "Please apply a tighter filter (e.g. by adjusted p-value or ",
             "delta-beta) before generating the heatmap.")
    )
  }

  # ── Step 4 – Load sample sheet ────────────────────────────────────────────────
  curr_pct <- as.integer(round(4L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Loading sample sheet")

  pd <- tryCatch({
    raw_lines  <- readLines(sheet_path, warn = FALSE)
    data_start <- grep("^\\[Data\\]", raw_lines)
    if (length(data_start) > 0L) {
      read_csv(sheet_path, skip = data_start[[1L]], show_col_types = FALSE)
    } else {
      read_csv(sheet_path, show_col_types = FALSE)
    }
  }, error = function(e) {
    emit_error(paste("Failed to read sample_sheet.csv:", conditionMessage(e)))
  })

  if (nrow(pd) == 0L)
    emit_error("Sample sheet is empty")

  name_col     <- if ("Sample_Name" %in% colnames(pd)) "Sample_Name" else colnames(pd)[1]
  sample_names <- as.character(pd[[name_col]])

  emit_progress(curr_pct, paste("Sample sheet loaded:", nrow(pd), "samples,", ncol(pd), "columns"))

  # ── Step 5 – Extract beta matrix from DMP/DMR table ───────────────────────────
  curr_pct <- as.integer(round(5L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Extracting beta values from DMP/DMR table")

  beta_file_fallback <- file.path(job_dir, "beta.rds")
  uses_fallback      <- FALSE
  group_avg_mode     <- FALSE

  if (file.exists(beta_file_fallback)) {
    emit_progress(curr_pct, "Found beta.rds in job directory. Direct sample matrix extraction initiated.")
    # beta.rds is normally a plain matrix, but extract_beta() also handles an S4
    # minfi object robustly (and preprocesses an RGChannelSet if ever passed).
    beta_obj <- tryCatch(
      extract_beta(readRDS(beta_file_fallback)),
      error = function(e) emit_error(paste("Failed to read beta.rds:", conditionMessage(e)))
    )
    common_rows <- intersect(rownames(dmp), rownames(beta_obj))

    if (length(common_rows) > 0L) {
      dmp      <- dmp[common_rows, , drop = FALSE]
      beta_tmp <- as.matrix(beta_obj[common_rows, , drop = FALSE])

      sentrix_col <- NULL
      for (candidate in colnames(pd)) {
        if (candidate == name_col) next
        vals <- as.character(pd[[candidate]])
        if (any(vals %in% colnames(beta_tmp))) {
          sentrix_col <- candidate
          break
        }
      }

      if (is.null(sentrix_col) && all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(pd))) {
        combined <- paste0(as.character(pd$Sentrix_ID), "_", as.character(pd$Sentrix_Position))
        if (any(combined %in% colnames(beta_tmp))) {
          pd$Sentrix_Address <- combined
          sentrix_col        <- "Sentrix_Address"
          emit_progress(curr_pct, "Built Sentrix_Address from Sentrix_ID + Sentrix_Position")
        }
      }

      if (!is.null(sentrix_col)) {
        addr_to_name <- setNames(as.character(pd[[name_col]]), as.character(pd[[sentrix_col]]))
        matched_addrs <- intersect(colnames(beta_tmp), names(addr_to_name))

        if (length(matched_addrs) > 0L) {
          beta_tmp       <- beta_tmp[, matched_addrs, drop = FALSE]
          colnames(beta_tmp) <- addr_to_name[matched_addrs]
          emit_progress(curr_pct, paste0("Sentrix addresses mapped to Sample_Names via column '", sentrix_col, "': ", paste(colnames(beta_tmp), collapse = ", ")))

          sample_cols_fb <- intersect(colnames(beta_tmp), sample_names)
          if (length(sample_cols_fb) > 0L) {
            beta           <- beta_tmp[, sample_cols_fb, drop = FALSE]
            group_avg_mode <- FALSE
            uses_fallback  <- TRUE
            emit_progress(curr_pct, paste("Beta matrix successfully recovered from beta.rds:", nrow(beta), "rows x", ncol(beta), "columns."))
          }
        }
      }

      if (!uses_fallback) {
        if (ncol(beta_tmp) == length(sample_names)) {
          colnames(beta_tmp) <- sample_names
          beta           <- beta_tmp
          group_avg_mode <- FALSE
          uses_fallback  <- TRUE
          emit_progress(curr_pct, "Column count matches sample sheet – names aligned positionally.")
        } else {
          emit_progress(curr_pct, paste0("beta.rds: no column mapping found. beta.rds cols: ", paste(head(colnames(beta_tmp), 3L), collapse=", "), " | sentrix_col found: ", !is.null(sentrix_col)))
        }
      }
    }
  }

  if (!uses_fallback) {
    sample_cols <- intersect(colnames(dmp), sample_names)
    avg_pattern <- grepl("^GROUP[0-9]+_AVG$", colnames(dmp), ignore.case = TRUE)
    avg_cols    <- colnames(dmp)[avg_pattern]

    if (length(sample_cols) == 0L && any(avg_pattern)) {
      group_avg_mode <- TRUE
      beta           <- as.matrix(dmp[, avg_cols, drop = FALSE])
      colnames(beta) <- gsub("_AVG$", "", colnames(beta), ignore.case = TRUE)
      emit_progress(curr_pct, paste("No per-sample columns found – using group average columns:", paste(avg_cols, collapse = ", "), ". Heatmap will show group means, not individual samples."))
    } else if (length(sample_cols) > 0L) {
      group_avg_mode <- FALSE
      beta           <- as.matrix(dmp[, sample_cols, drop = FALSE])
      emit_progress(curr_pct, paste("Per-sample beta columns found:", paste(sample_cols, collapse = ", ")))
    } else {
      emit_error("No beta values or group averages found in DMP/DMR table.")
    }
  }

  storage.mode(beta) <- "numeric"

  if (nrow(beta) == 0L || ncol(beta) == 0L)
    emit_error("Extracted beta matrix is empty")

  finite_vals <- beta[is.finite(beta)]
  if (length(finite_vals) > 0L && (min(finite_vals) < -0.01 || max(finite_vals) > 1.01)) {
      emit_progress(curr_pct, paste0("Warning: beta values outside [0,1] range (min=", round(min(finite_vals), 4), ", max=", round(max(finite_vals), 4), "). Verify these are beta values (not M-values)."))
  }

  na_count <- sum(is.na(beta))
  if (na_count > 0L) {
    na_frac <- na_count / length(beta)
    if (na_frac > 0.2)
      emit_error(paste0("Beta matrix contains ", na_count, " NA values (", round(na_frac * 100, 1), "%). Please filter NA-heavy rows before generating the heatmap."))
    emit_progress(curr_pct, paste0("Warning: ", na_count, " NA values – grey cells in heatmap"))
  }

  emit_progress(curr_pct, paste("Beta matrix ready:", nrow(beta), "rows x", ncol(beta), "columns"))

  # ── Step 6 – Build pd_aligned ─────────────────────────────────────────────────
  curr_pct <- as.integer(round(6L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Aligning sample metadata to beta columns")

  if (group_avg_mode) {
    group_labels   <- colnames(beta)
    pd_aligned <- data.frame(
      Sample_Name  = group_labels,
      Sample_Group = group_labels,
      stringsAsFactors = FALSE
    )
    name_col     <- "Sample_Name"
    sample_names <- pd_aligned$Sample_Name
    emit_progress(curr_pct, paste("Group-avg mode: column labels cleaned to:", paste(group_labels, collapse = ", ")))
  } else {
    matched <- match(colnames(beta), sample_names)
    if (any(is.na(matched))) {
      missing_s <- colnames(beta)[is.na(matched)]
      emit_error(paste("Beta columns not found in sample sheet:", paste(head(missing_s, 5L), collapse = ", ")))
    }
    pd_aligned <- pd[matched, , drop = FALSE]
    emit_progress(curr_pct, paste("Sample sheet aligned:", nrow(pd_aligned), "samples matched"))
  }

  # ── Step 7 – Grouping columns, annotation & sort ──────────────────────────────
  curr_pct <- as.integer(round(7L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Detecting grouping columns and sorting")

  if (group_avg_mode) {
    g1_vals       <- colnames(beta)
    group2_active <- FALSE
    emit_progress(curr_pct, paste("Group-avg mode: annotation uses clean labels:", paste(g1_vals, collapse = ", ")))
  } else {
    non_id_cols <- setdiff(colnames(pd_aligned), name_col)

    # The user explicitly chooses the primary column (any non-empty column is
    # allowed, incl. continuous ones like "age"). Auto-selection is only a
    # fallback when no column was provided.
    if (!group1_set) {
      valid_group_cols <- Filter(function(col) {
        n_uniq <- length(unique(na.omit(as.character(pd_aligned[[col]]))))
        n_uniq >= 2L && n_uniq < nrow(pd_aligned)
      }, non_id_cols)
      group1 <- if ("Sample_Group" %in% valid_group_cols) "Sample_Group"
                else if (length(valid_group_cols) > 0L) valid_group_cols[1L]
                else if (length(non_id_cols) > 0L) non_id_cols[1L]
                else emit_error("No usable columns in sample sheet for grouping.")
      emit_progress(curr_pct, paste("Primary grouping column auto-selected:", group1))
    } else if (!group1 %in% colnames(pd_aligned)) {
      emit_error(paste("Primary grouping column not found:", group1))
    }
  
    if (group2_active) {
      if (!group2 %in% colnames(pd_aligned))
        emit_error(paste("Secondary grouping column not found:", group2))
      if (group1 == group2)
        emit_error("Primary and secondary grouping columns must be different")
    }
  
    g1_vals <- as.character(pd_aligned[[group1]])
    if (group2_active) g2_vals <- as.character(pd_aligned[[group2]])
  
    sort_idx <- if (group2_active) {
      order(g1_vals, g2_vals, colnames(beta))
    } else {
      order(g1_vals, colnames(beta))
    }
    beta       <- beta[, sort_idx, drop = FALSE]
    pd_aligned <- pd_aligned[sort_idx, , drop = FALSE]
    g1_vals    <- g1_vals[sort_idx]
    if (group2_active) g2_vals <- g2_vals[sort_idx]
  }

  if (has_col_ci(dmp, "chr") && has_col_ci(dmp, "pos")) {
    chr_raw   <- as.character(get_col_ci(dmp, "chr")[match(rownames(beta), rownames(dmp))])
    pos_raw   <- as.numeric(  get_col_ci(dmp, "pos")[match(rownames(beta), rownames(dmp))])
    chr_clean <- sub("^[Cc][Hh][Rr]", "", chr_raw)
    chr_clean <- sub("^X$",  "23", chr_clean)
    chr_clean <- sub("^Y$",  "24", chr_clean)
    chr_clean <- sub("^M[T]?$", "25", chr_clean)
    chr_num   <- suppressWarnings(as.integer(chr_clean))
    beta      <- beta[order(chr_num, pos_raw, na.last = TRUE), , drop = FALSE]
    emit_progress(curr_pct, "CpGs sorted by genomic position (chr, pos)")
  } else {
    emit_progress(curr_pct, "chr/pos columns absent – keeping original row order")
  }

  # ── Build annotations (type-aware: categorical -> discrete, continuous -> gradient)
  # build_colours() / make_anno_spec() are provided by utils/heatmap_anno.R.

  primary_name <- if (group2_active) "Primary" else "Group"
  anno_specs   <- list(make_anno_spec(primary_name, g1_vals))
  if (group2_active && exists("g2_vals"))
    anno_specs <- c(anno_specs, list(make_anno_spec("Secondary", g2_vals)))

  anno_df <- data.frame(lapply(anno_specs, function(s) s$values),
                        check.names = FALSE, stringsAsFactors = FALSE)
  colnames(anno_df) <- vapply(anno_specs, function(s) s$name, character(1))
  anno_col <- setNames(lapply(anno_specs, function(s) s$col),
                       vapply(anno_specs, function(s) s$name, character(1)))

  # Annotation names ("Primary"/"Secondary"/"Group") sit on the LEFT, i.e. opposite
  # the legends (drawn on the right). Keeping them on the right made them share the
  # right-hand column with the legend stack and overlap; placing them on the left
  # guarantees the two can never collide regardless of figure height.
  top_anno <- HeatmapAnnotation(
    df  = anno_df,
    col = anno_col,
    annotation_name_side = "left",
    annotation_name_gp   = gpar(fontsize = 9),
    gap                  = unit(1, "mm"),
    show_legend          = FALSE
  )

  # ── Step 8 – Geometry, draw & export ──────────────────────────────────────────
  curr_pct <- as.integer(round(8L / TOTAL_STEPS * 100))
  emit_progress(curr_pct, "Drawing heatmap and saving PNG + PDF")

  heatmap_col <- colorRamp2(c(0, 0.5, 1), c("#2166AC", "#F7F7F7", "#D6604D"))

  n_cpg  <- nrow(beta)
  n_samp <- ncol(beta)

  # Clustering + dendrograms (HMP-01). Needs an NA-free matrix and ≥2 items;
  # otherwise fall back to the manual group/position ordering above.
  do_cluster        <- (na_count == 0L)
  cluster_cols_flag <- do_cluster && n_samp >= 2L
  cluster_rows_flag <- do_cluster && n_cpg  >= 2L
  if (!do_cluster)
    emit_progress(curr_pct, "NA values present – clustering disabled; ordered by group/position")

  # Dendrogram depth (the axis that carries the merge heights). Generous, so even
  # fine/low branches stay distinguishable instead of collapsing into a thin band.
  # The column (top) dendrogram needs at least as much depth as the row (left) one:
  # with few samples its vertical branches otherwise compress into an unreadable
  # band, so it is given comparable/greater height.
  COL_DEND_MM <- if (cluster_cols_flag) 48 else 0
  ROW_DEND_MM <- if (cluster_rows_flag) 32 else 0

  # Output resolution. Tall heatmaps (many CpGs) are capped at a lower DPI so the
  # pixel count and memory stay sane; small ones get crisp 200 dpi.
  DPI <- if (n_cpg > 150L) 100L else 200L
  MM_PER_INCH <- 25.4
  PT_PER_MM   <- 72 / MM_PER_INCH
  mm_to_px    <- function(mm) max(1L, round(mm * DPI / MM_PER_INCH))

  # ── Cell geometry: every CpG row stays labelled AND legible ───────────────────
  # Each row carries its CpG id, so a row must never be shorter than its label's
  # line height (otherwise labels overlap and the rows turn into an unreadable
  # smear — the problem reported at ~100 rows). Few rows → comfortably tall cells;
  # many rows → shrink only down to the legibility floor, never below.
  #
  # KNOB: `row_label_floor_mm` is the single place to later add an optional
  # "hide row labels above N rows" threshold — drop the floor and set
  # show_row_names = (n_cpg <= N).
  BASE_ROW_FONT_PT   <- 8
  row_label_floor_mm <- (BASE_ROW_FONT_PT / PT_PER_MM) * 1.25   # ≈ label line height + slack
  cell_h_mm <- max(row_label_floor_mm, min(12, 240 / max(n_cpg, 1L)))
  cell_w_mm <- max(18, min(45, 140 / max(n_samp, 1L)))

  # Font scales up when cells are tall; never below the legible base.
  row_name_fontsize_pt  <- max(BASE_ROW_FONT_PT, min(12, cell_h_mm * 2.0))
  col_label_fontsize_pt <- 9
  LEGEND_FONTSIZE_PT    <- 9

  body_w_mm <- n_samp * cell_w_mm
  body_h_mm <- n_cpg  * cell_h_mm

  # ── Legends: content built here, PLACEMENT + sizing delegated to ComplexHeatmap
  # We keep full control over what the legends say (custom beta ticks, per-column
  # annotation legends) but let the library reserve their space — the manual
  # viewport placement it replaces was what clipped the legend on the right.
  lgd_beta <- Legend(
    col_fun        = heatmap_col,
    title          = "Beta value",
    at             = c(0, 0.25, 0.5, 0.75, 1),
    labels         = c("0", "0.25", "0.5", "0.75", "1"),
    direction      = "vertical",
    title_position = "topcenter",
    labels_gp      = gpar(fontsize = LEGEND_FONTSIZE_PT),
    title_gp       = gpar(fontsize = LEGEND_FONTSIZE_PT, fontface = "bold"),
    legend_height  = unit(35, "mm"),
    grid_width     = unit(5,  "mm")
  )

  # One legend per annotation column (gradient for continuous, swatches otherwise).
  anno_legends <- lapply(anno_specs, function(s) {
    if (identical(s$kind, "continuous")) {
      Legend(col_fun = s$col, title = s$name,
             title_gp  = gpar(fontsize = LEGEND_FONTSIZE_PT, fontface = "bold"),
             labels_gp = gpar(fontsize = LEGEND_FONTSIZE_PT))
    } else {
      Legend(labels = names(s$col), legend_gp = gpar(fill = s$col), title = s$name,
             title_gp  = gpar(fontsize = LEGEND_FONTSIZE_PT, fontface = "bold"),
             labels_gp = gpar(fontsize = LEGEND_FONTSIZE_PT))
    }
  })

  ht <- Heatmap(
    matrix               = beta,
    name                 = "Beta\nvalue",
    col                  = heatmap_col,
    top_annotation       = top_anno,
    column_names_rot     = 45,
    column_names_gp      = gpar(fontsize = col_label_fontsize_pt),
    column_names_side    = "bottom",
    row_names_side       = "left",
    row_names_gp         = gpar(fontsize = row_name_fontsize_pt),
    show_row_names       = TRUE,
    show_column_names    = TRUE,
    cluster_rows         = cluster_rows_flag,
    cluster_columns      = cluster_cols_flag,
    show_row_dend        = cluster_rows_flag,
    show_column_dend     = cluster_cols_flag,
    row_dend_width       = unit(ROW_DEND_MM, "mm"),
    column_dend_height   = unit(COL_DEND_MM, "mm"),
    show_heatmap_legend  = FALSE,                 # supplied via heatmap_legend_list
    border     = FALSE,
    rect_gp    = gpar(col = NA),
    na_col     = "#CCCCCC",
    use_raster = FALSE,
    width  = unit(body_w_mm, "mm"),
    height = unit(body_h_mm, "mm")
  )

  OUTER_MM <- 12

  #' Draw the heatmap with its legends.
  #'
  #' Single draw routine used for both measuring and final output. ComplexHeatmap
  #' lays out the body, labels, dendrograms and supplied legends together and
  #' reserves space for each, so nothing is clipped once the device matches the
  #' measured size.
  #'
  #' @return The drawn \code{HeatmapList} object (invisibly via \code{draw}).
  draw_all <- function() {
    draw(ht,
         heatmap_legend_list    = list(lgd_beta),
         annotation_legend_list = anno_legends,
         heatmap_legend_side    = "right",
         annotation_legend_side = "right",
         merge_legends          = TRUE,
         padding                = unit(rep(OUTER_MM, 4L), "mm"))
  }

  #' Measure the full drawn layout (body + labels + dendrograms + legends).
  #'
  #' Draws once on a null device and reads back the real layout size, so the
  #' output devices can be sized exactly to the content (rather than estimating
  #' padding by hand, which is what previously clipped the legend). Uses an
  #' internal ComplexHeatmap accessor; the caller wraps this in a tryCatch with a
  #' size estimate as a fallback.
  #'
  #' @return A named numeric vector \code{c(w, h)} in millimetres.
  measure_layout <- function() {
    grDevices::pdf(NULL, width = 300, height = 300)
    on.exit(grDevices::dev.off(), add = TRUE)
    drawn <- draw_all()
    c(
      w = convertWidth( ComplexHeatmap:::width(drawn),  "mm", valueOnly = TRUE),
      h = convertHeight(ComplexHeatmap:::height(drawn), "mm", valueOnly = TRUE)
    )
  }

  dims <- tryCatch(measure_layout(), error = function(e) {
    emit_progress(curr_pct, paste("Layout measurement failed, using estimate:", conditionMessage(e)))
    c(w = body_w_mm + ROW_DEND_MM + 130, h = body_h_mm + COL_DEND_MM + 80)
  })

  canvas_w_mm <- max(as.numeric(dims[["w"]]), 160)
  canvas_h_mm <- max(as.numeric(dims[["h"]]), 100)

  png_width_px  <- mm_to_px(canvas_w_mm)
  png_height_px <- mm_to_px(canvas_h_mm)

  emit_progress(curr_pct, paste0("Canvas: ", round(canvas_w_mm), " x ", round(canvas_h_mm), " mm | ", png_width_px, " x ", png_height_px, " px @ ", DPI, " dpi | grid: ", n_samp, "c x ", n_cpg, "r | cell: ", round(cell_w_mm,1), "x", round(cell_h_mm,1), " mm"))

  # Write PNG (mandatory) + vector PDF (best-effort) from the single draw routine.
  tryCatch(
    render_png_and_pdf(
      output_path, draw_fn = draw_all,
      width = png_width_px, height = png_height_px, res = DPI, units = "px",
      pdf_path = pdf_path,
      on_pdf_error = function(msg) emit_progress(curr_pct, paste("Warning: failed to save PDF:", msg))
    ),
    error = function(e) emit_error(paste("Failed to save PNG:", conditionMessage(e)))
  )

  emit_progress(100L, paste("Heatmap saved:", output_path))
  emit_done(output = output_path)
}