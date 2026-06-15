#!/usr/bin/env Rscript
# heatmap.R
# Generates a heatmap PNG from DMP/DMR results.
# Part of the swtp-ss26-bigtom DNA Methylation Analysis Platform.
#
# Usage:
#   Rscript heatmap.R <result.rds> <sample_sheet.csv> <job_dir>

# ── Packages ──────────────────────────────────────────────────────────────────
suppressPackageStartupMessages({
  library(jsonlite)
  library(ComplexHeatmap)
  library(circlize)
  library(readr)
  library(grid)
})

# Use shared progress & logging utilities
source("/app/r_backend/utils/progress.R")

TOTAL_STEPS <- 8L
curr_pct    <- 0L  # Hält den aktuellen globalen Prozentwert für Sub-Meldungen

# ── Arguments ─────────────────────────────────────────────────────────────────
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
out_file <- Sys.getenv("HEATMAP_OUTPUT", unset = "heatmap.png")

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

# Helpers
get_col_ci <- function(df, name) {
  idx <- match(toupper(name), toupper(colnames(df)))
  if (is.na(idx)) NULL else df[[idx]]
}
has_col_ci <- function(df, name) !is.na(match(toupper(name), toupper(colnames(df))))

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

# ── Step 2b – Apply filters from environment variables ────────────────────────
chr_filter     <- Sys.getenv("HEATMAP_CHR",           unset = "")
start_filter   <- suppressWarnings(as.integer(Sys.getenv("HEATMAP_START",          unset = "")))
stop_filter    <- suppressWarnings(as.integer(Sys.getenv("HEATMAP_STOP",           unset = "")))
pval_max       <- suppressWarnings(as.numeric(Sys.getenv("HEATMAP_PVAL_MAX",       unset = "")))
adj_pval_max   <- suppressWarnings(as.numeric(Sys.getenv("HEATMAP_ADJ_PVAL_MAX",   unset = "")))
delta_beta_min <- suppressWarnings(as.numeric(Sys.getenv("HEATMAP_DELTA_BETA_MIN", unset = "")))
delta_beta_max <- suppressWarnings(as.numeric(Sys.getenv("HEATMAP_DELTA_BETA_MAX", unset = "")))
dmr_id_filter  <- Sys.getenv("HEATMAP_DMR_ID", unset = "")

rows_before <- nrow(dmp)

if (nzchar(chr_filter) && has_col_ci(dmp, "chr")) {
  chr_col <- as.character(get_col_ci(dmp, "chr"))
  dmp <- dmp[!is.na(chr_col) & toupper(chr_col) == toupper(chr_filter), , drop = FALSE]
}
if (!is.na(start_filter) && has_col_ci(dmp, "pos")) {
  pos_col <- as.numeric(get_col_ci(dmp, "pos"))
  dmp <- dmp[!is.na(pos_col) & pos_col >= start_filter, , drop = FALSE]
}
if (!is.na(stop_filter) && has_col_ci(dmp, "pos")) {
  pos_col <- as.numeric(get_col_ci(dmp, "pos"))
  dmp <- dmp[!is.na(pos_col) & pos_col <= stop_filter, , drop = FALSE]
}
if (!is.na(pval_max) && has_col_ci(dmp, "pvalue")) {
  pval_col <- as.numeric(get_col_ci(dmp, "pvalue"))
  dmp <- dmp[!is.na(pval_col) & pval_col <= pval_max, , drop = FALSE]
}
if (!is.na(adj_pval_max) && "ADJ_P" %in% colnames(dmp)) {
  adj_col <- as.numeric(dmp[["ADJ_P"]])
  dmp <- dmp[!is.na(adj_col) & adj_col <= adj_pval_max, , drop = FALSE]
}
if (!is.na(delta_beta_min) && has_col_ci(dmp, "deltaBeta")) {
  db_col <- as.numeric(get_col_ci(dmp, "deltaBeta"))
  dmp <- dmp[!is.na(db_col) & db_col >= delta_beta_min, , drop = FALSE]
}
if (!is.na(delta_beta_max) && has_col_ci(dmp, "deltaBeta")) {
  db_col <- as.numeric(get_col_ci(dmp, "deltaBeta"))
  dmp <- dmp[!is.na(db_col) & db_col <= delta_beta_max, , drop = FALSE]
}
if (nzchar(dmr_id_filter) && has_col_ci(dmp, "dmr_id")) {
  dmr_col <- as.character(get_col_ci(dmp, "dmr_id"))
  dmp <- dmp[!is.na(dmr_col) & dmr_col == dmr_id_filter, , drop = FALSE]
}

emit_progress(curr_pct, paste0("Filters applied: ", rows_before, " → ", nrow(dmp), " rows remaining"))

if (nrow(dmp) == 0L)
  emit_error("No rows remaining after applying filters. Please relax the filter criteria.")

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
  beta_obj    <- readRDS(beta_file_fallback)
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
  non_id_cols      <- setdiff(colnames(pd_aligned), name_col)
  valid_group_cols <- Filter(function(col) {
    vals   <- pd_aligned[[col]]
    n_uniq <- length(unique(na.omit(as.character(vals))))
    n_uniq >= 2L && n_uniq < nrow(pd_aligned)
  }, non_id_cols)
  
  if (length(valid_group_cols) == 0L) {
    emit_error(paste0("No valid grouping columns found in sample sheet. Columns checked: ", paste(non_id_cols, collapse = ", ")))
  }
  emit_progress(curr_pct, paste("Valid grouping columns:", paste(valid_group_cols, collapse = ", ")))
  
  if (!group1_set) {
    group1 <- if ("Sample_Group" %in% valid_group_cols) "Sample_Group" else valid_group_cols[1L]
    emit_progress(curr_pct, paste("Primary grouping column auto-selected:", group1))
  } else {
    if (!group1 %in% colnames(pd_aligned))
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

# ── Build annotation colour palettes ─────────────────────────────────────────
build_colours <- function(values) {
  lvls    <- unique(values)
  palette <- c("#4E79A7", "#F28E2B", "#E15759", "#76B7B2",
               "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7",
               "#9C755F", "#BAB0AC", "#D37295", "#A0CBE8")
  setNames(rep_len(palette, length(lvls)), lvls)
}

g1_colours <- build_colours(g1_vals)

top_anno <- if (group2_active && exists("g2_vals")) {
  HeatmapAnnotation(
    df  = data.frame(Primary = g1_vals, Secondary = g2_vals, check.names = FALSE),
    col = list(Primary   = g1_colours, Secondary = build_colours(g2_vals)),
    annotation_name_side = "right",
    annotation_name_gp   = gpar(fontsize = 9),
    annotation_height    = unit(rep(6, 2), "mm"),
    gap                  = unit(1, "mm"),
    show_legend          = FALSE
  )
} else {
  HeatmapAnnotation(
    df  = data.frame(Group = g1_vals, check.names = FALSE),
    col = list(Group = g1_colours),
    annotation_name_side = "right",
    annotation_name_gp   = gpar(fontsize = 9),
    annotation_height    = unit(6, "mm"),
    show_legend          = FALSE
  )
}

# ── Step 8 – Draw & export ────────────────────────────────────────────────────
curr_pct <- as.integer(round(8L / TOTAL_STEPS * 100))
emit_progress(curr_pct, "Drawing heatmap and saving PNG")

heatmap_col <- colorRamp2(c(0, 0.5, 1), c("#2166AC", "#F7F7F7", "#D6604D"))

n_cpg  <- nrow(beta)
n_samp <- ncol(beta)

DPI <- if (n_cpg > 300L) 100L else 200L
MM_PER_INCH <- 25.4
PT_PER_MM   <- 72 / MM_PER_INCH
mm_to_px    <- function(mm) round(mm * DPI / MM_PER_INCH)

cell_h_mm <- max(2, min(25, 200 / max(n_cpg, 1L)))
cell_w_mm <- max(18, min(45, 140 / max(n_samp, 1L)))

row_name_fontsize_pt  <- max(7, min(11, cell_h_mm * 2.2))
col_label_fontsize_pt <- 9
LEGEND_FONTSIZE_PT    <- 9

char_w_mm <- function(fontsize_pt) fontsize_pt * 0.55 / PT_PER_MM

body_w_mm <- n_samp * cell_w_mm
body_h_mm <- n_cpg  * cell_h_mm

max_rowname_chars <- max(nchar(rownames(beta)), na.rm = TRUE)
row_name_mm       <- max_rowname_chars * char_w_mm(row_name_fontsize_pt) + 6

max_colname_chars <- max(nchar(colnames(beta)), na.rm = TRUE)
col_label_mm      <- max_colname_chars * char_w_mm(col_label_fontsize_pt) * sin(pi / 4) + 8

n_anno_bars   <- if (group2_active) 2L else 1L
anno_total_mm <- n_anno_bars * 6 + max(0L, n_anno_bars - 1L) * 1 + 2

lgd_beta <- Legend(
  col_fun       = heatmap_col,
  title         = "Beta value",
  at            = c(0, 0.25, 0.5, 0.75, 1),
  labels        = c("0", "0.25", "0.5", "0.75", "1"),
  direction     = "vertical",
  title_position = "topcenter",
  labels_gp     = gpar(fontsize = LEGEND_FONTSIZE_PT),
  title_gp      = gpar(fontsize = LEGEND_FONTSIZE_PT, fontface = "bold"),
  legend_height = unit(35, "mm"),
  grid_width    = unit(5,  "mm")
)

lgd_group1 <- Legend(
  labels    = names(g1_colours),
  legend_gp = gpar(fill = g1_colours),
  title     = if (group2_active) "Primary" else "Group",
  title_gp  = gpar(fontsize = LEGEND_FONTSIZE_PT, fontface = "bold"),
  labels_gp = gpar(fontsize = LEGEND_FONTSIZE_PT)
)

lgd_list <- if (group2_active && exists("g2_vals")) {
  g2_colours <- build_colours(g2_vals)
  lgd_group2 <- Legend(
    labels    = names(g2_colours),
    legend_gp = gpar(fill = g2_colours),
    title     = "Secondary",
    title_gp  = gpar(fontsize = LEGEND_FONTSIZE_PT, fontface = "bold"),
    labels_gp = gpar(fontsize = LEGEND_FONTSIZE_PT)
  )
  packLegend(lgd_beta, lgd_group1, lgd_group2, direction = "vertical", gap = unit(5, "mm"))
} else {
  packLegend(lgd_beta, lgd_group1, direction = "vertical", gap = unit(5, "mm"))
}

lgd_w_mm <- convertWidth( ComplexHeatmap:::width(lgd_list),  "mm", valueOnly = TRUE)
lgd_h_mm <- convertHeight(ComplexHeatmap:::height(lgd_list), "mm", valueOnly = TRUE)

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
  cluster_rows         = FALSE,
  cluster_columns      = FALSE,
  show_heatmap_legend  = FALSE,
  border     = FALSE,
  rect_gp    = gpar(col = NA),
  na_col     = "#CCCCCC",
  use_raster = FALSE,
  width  = unit(body_w_mm, "mm"),
  height = unit(body_h_mm, "mm")
)

OUTER_MM      <- 18
LEGEND_GAP_MM <- 18

pad_top_mm    <- anno_total_mm + OUTER_MM
pad_bottom_mm <- col_label_mm  + OUTER_MM
pad_left_mm   <- row_name_mm   + OUTER_MM
pad_right_mm  <- LEGEND_GAP_MM + lgd_w_mm + OUTER_MM

body_area_h_mm   <- pad_top_mm + body_h_mm + pad_bottom_mm
legend_area_h_mm <- lgd_h_mm + 2 * OUTER_MM + 10
canvas_h_mm <- max(body_area_h_mm, legend_area_h_mm, 100)

canvas_w_mm <- pad_left_mm + body_w_mm + pad_right_mm
canvas_w_mm <- max(canvas_w_mm, 160)

png_width_px  <- mm_to_px(canvas_w_mm)
png_height_px <- mm_to_px(canvas_h_mm)

emit_progress(curr_pct, paste0("Canvas: ", round(canvas_w_mm), " x ", round(canvas_h_mm), " mm | ", png_width_px, " x ", png_height_px, " px @ ", DPI, " dpi | grid: ", n_samp, "c x ", n_cpg, "r | cell: ", round(cell_w_mm,1), "x", round(cell_h_mm,1), " mm"))

tryCatch({
  png(output_path, width  = png_width_px, height = png_height_px, res    = DPI)
  
  draw(ht, show_annotation_legend = FALSE, padding = unit(c(pad_bottom_mm, pad_left_mm, pad_top_mm, pad_right_mm), "mm"))
  
  lgd_cx_npc <- (pad_left_mm + body_w_mm + LEGEND_GAP_MM + lgd_w_mm / 2) / canvas_w_mm
  lgd_cy_npc <- 0.5
  
  half_lgd_w_npc <- (lgd_w_mm / 2 + OUTER_MM) / canvas_w_mm
  half_lgd_h_npc <- (lgd_h_mm / 2 + OUTER_MM) / canvas_h_mm
  
  lgd_cx_npc <- max(half_lgd_w_npc, min(lgd_cx_npc, 1 - half_lgd_w_npc))
  lgd_cy_npc <- max(half_lgd_h_npc, min(lgd_cy_npc, 1 - half_lgd_h_npc))
  
  tryCatch(seekViewport("global"), error = function(e) upViewport(0))
  pushViewport(viewport(x = unit(lgd_cx_npc, "npc"), y = unit(lgd_cy_npc, "npc"), just = c("center", "center"), name = "legend_vp"))
  draw(lgd_list)
  popViewport()
  
  dev.off()
}, error = function(e) {
  try(dev.off(), silent = TRUE)
  emit_error(paste("Failed to save PNG:", conditionMessage(e)))
})

if (!file.exists(output_path))
  emit_error(paste("PNG not created at expected path:", output_path))

emit_progress(100L, paste("Heatmap saved:", output_path))
emit_done(output = output_path)