# r_backend/utils/heatmap_anno.R
#
# Annotation helpers for the sample heatmap: pick colours for a categorical
# variable and decide whether an annotation column should be drawn as discrete
# swatches or a continuous colour gradient.
#
# These are pure helpers (no side effects, no progress contract), so they can be
# sourced and unit-tested in isolation. make_anno_spec() builds a continuous
# colour map with circlize::colorRamp2(); the caller must have the circlize
# package available (heatmap.R attaches it before sourcing this file).

#' Assign a distinct colour to each level of a categorical variable.
#'
#' Uses a fixed 12-colour qualitative palette (Tableau 10 + extras) and recycles
#' it when a variable has more than 12 levels, so every level always gets a
#' colour.
#'
#' @param values A vector of category values (coerced to character).
#' @return A named character vector mapping each distinct level to a hex colour.
build_colours <- function(values) {
  lvls <- unique(as.character(values))
  palette <- c(
    "#4E79A7", "#F28E2B", "#E15759", "#76B7B2",
    "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7",
    "#9C755F", "#BAB0AC", "#D37295", "#A0CBE8"
  )
  setNames(rep_len(palette, length(lvls)), lvls)
}

#' Build an annotation specification for one sample-sheet column.
#'
#' Decides whether a column is continuous (numeric with many distinct values,
#' e.g. "age" -> a colour gradient) or categorical (discrete swatches). A numeric
#' column is only treated as continuous when it has MORE than 10 distinct values
#' and a non-degenerate range; otherwise it is drawn as discrete categories (so a
#' small numeric code like a batch id stays categorical).
#'
#' @param name Annotation display name (e.g. "Primary"/"Secondary"/"Group").
#' @param raw_values The column values.
#' @return A list with \code{name}, \code{kind} ("continuous" or "discrete"),
#'   \code{values} (numeric for continuous, character for discrete) and
#'   \code{col} (a \code{colorRamp2} function for continuous, a named colour
#'   vector for discrete).
make_anno_spec <- function(name, raw_values) {
  vals_chr <- as.character(raw_values)
  nonempty <- vals_chr[nzchar(trimws(vals_chr))]
  n_dist <- length(unique(nonempty))
  num <- suppressWarnings(as.numeric(vals_chr))
  is_num <- length(nonempty) > 0L && all(!is.na(suppressWarnings(as.numeric(nonempty))))
  if (is_num && n_dist > 10L) {
    rng <- range(num, na.rm = TRUE)
    if (is.finite(rng[1]) && is.finite(rng[2]) && rng[1] != rng[2]) {
      col_fun <- colorRamp2(
        c(rng[1], mean(rng), rng[2]),
        c("#FFF7BC", "#FEC44F", "#D95F0E")
      )
      return(list(name = name, kind = "continuous", values = num, col = col_fun))
    }
  }
  list(name = name, kind = "discrete", values = vals_chr, col = build_colours(vals_chr))
}
