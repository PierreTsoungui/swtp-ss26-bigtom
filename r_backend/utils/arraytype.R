# r_backend/utils/arraytype.R
#
# Single source of truth for the Illumina array type (450K / EPIC v1 / EPIC v2)
# across the pipeline. ChAMP's champ.DMP / champ.DMR need the correct
# \code{arraytype} to load the matching probe annotation; passing the wrong one
# fails (e.g. "object 'probe.features' not found"). minfi detects the platform
# from the IDATs during filtering, so that detection is authoritative and is
# persisted to \code{array_type.txt} for the downstream steps to read.
#
# Usage:
#   source("/app/r_backend/utils/progress.R")   # provides emit_error()
#   source("/app/r_backend/utils/arraytype.R")
#
# NOTE: normalize_arraytype() calls emit_error() on invalid input, so
# utils/progress.R must be sourced first.

#' Canonical array-type identifiers used throughout the pipeline.
ARRAY_TYPES <- c("450K", "EPICv1", "EPICv2")

#' File name (within a job directory) that carries the detected array type.
ARRAY_TYPE_FILE <- "array_type.txt"

#' Normalize an array-type string to the canonical set.
#'
#' Accepts the canonical values and common aliases (\code{EPIC}/\code{850K} are
#' treated as EPIC v1). Matching is case-insensitive.
#'
#' @param x Raw array-type string.
#' @return One of \code{"450K"}, \code{"EPICv1"}, \code{"EPICv2"}; emits a fatal
#'   error (via \code{emit_error}) for anything else.
normalize_arraytype <- function(x) {
  x <- toupper(trimws(as.character(x)))
  if (x %in% c("EPIC", "850K", "EPICV1")) return("EPICv1")
  if (x == "EPICV2") return("EPICv2")
  if (x == "450K")   return("450K")
  emit_error(sprintf("Invalid arraytype: '%s'. Allowed: 450K, EPICv1 (EPIC), EPICv2.", x))
}

#' Translate a canonical array type to the value ChAMP's champ.DMP / champ.DMR
#' expect for their \code{arraytype} argument.
#'
#' ChAMP uses \code{"EPIC"} for EPIC v1 (its annotation data set is
#' \code{probe.features.epic}); passing \code{"EPICv1"} hits no branch inside
#' champ.* and fails with "object 'probe.features' not found". 450K and EPIC v2
#' keep their names.
#'
#' @param x An array type (canonical or alias; normalized internally).
#' @return The ChAMP arraytype string: \code{"450K"}, \code{"EPIC"} or
#'   \code{"EPICv2"}.
champ_arraytype <- function(x) {
  switch(normalize_arraytype(x),
         "450K"   = "450K",
         "EPICv1" = "EPIC",
         "EPICv2" = "EPICv2")
}

#' Candidate ChAMPdata \code{probe.features} data set names per array type.
#'
#' Loading any of these with \code{utils::data()} creates an object literally
#' named \code{probe.features} (the generic name — NOT the data-set name), which
#' is exactly what ChAMP references internally. EPIC v2 has no ChAMPdata data set
#' at all (\code{probe.features.epicv2} does not exist), so it is built from the
#' installed minfi annotation instead (see \code{\link{build_probe_features_minfi}}).
CHAMP_PROBE_FEATURES <- list(
  "450K"   = c("probe.features"),
  "EPICv1" = c("probe.features.epic", "probe.features.epicv1"),
  "EPICv2" = character(0)
)

#' minfi annotation package that carries the manifest for each array type.
#'
#' Used to build a \code{probe.features}-compatible table when ChAMPdata has no
#' matching data set (EPIC v2), or as a universal fallback.
MINFI_ANNO_PKG <- list(
  "450K"   = "IlluminaHumanMethylation450kanno.ilmn12.hg19",
  "EPICv1" = "IlluminaHumanMethylationEPICanno.ilm10b4.hg19",
  "EPICv2" = "IlluminaHumanMethylationEPICv2anno.20a1.hg38"
)

#' Load a ChAMPdata \code{probe.features} table for an array type.
#'
#' Each candidate data set, when loaded, materialises an object called
#' \code{probe.features}; the created name does NOT equal the data-set name, so we
#' take whatever object \code{data()} produced rather than assuming its name.
#'
#' @param arraytype An array type (canonical or alias).
#' @return The \code{probe.features} data.frame, or \code{NULL} if unavailable.
load_probe_features_champdata <- function(arraytype) {
  for (nm in CHAMP_PROBE_FEATURES[[normalize_arraytype(arraytype)]]) {
    pf <- tryCatch({
      e <- new.env()
      suppressWarnings(utils::data(list = nm, package = "ChAMPdata", envir = e))
      created <- ls(e)                       # e.g. "probe.features", not `nm`
      if (length(created) > 0L) get(created[[1L]], envir = e) else NULL
    }, error = function(err) NULL)
    if (is.data.frame(pf) && nrow(pf) > 0L) return(pf)
  }
  NULL
}

#' Build a ChAMP \code{probe.features}-compatible table from a minfi annotation.
#'
#' ChAMP's \code{champ.DMP} / \code{champ.DMR} expect a global \code{probe.features}
#' data.frame keyed by probe id with the columns \code{CHR, MAPINFO, Strand, Type,
#' gene, feature, cgi, feat.cgi}. EPIC v2 has no such ChAMPdata data set, but the
#' equivalent information lives in the installed minfi EPIC v2 manifest
#' (\code{IlluminaHumanMethylationEPICv2anno.20a1.hg38}). This reconstructs the
#' table from that annotation so the ChAMP steps work unchanged. The probe ids
#' (row names) carry the EPIC v2 replicate suffix (e.g. \code{cg25324105_BC11}),
#' matching the beta matrix.
#'
#' @param arraytype An array type (canonical or alias).
#' @return A \code{probe.features} data.frame, or \code{NULL} if the annotation
#'   package is not installed / cannot be read.
build_probe_features_minfi <- function(arraytype) {
  at  <- normalize_arraytype(arraytype)
  pkg <- MINFI_ANNO_PKG[[at]]
  if (is.null(pkg) || !requireNamespace(pkg, quietly = TRUE)) return(NULL)

  # Pass the annotation package NAME (not the object): minfi attaches the package
  # itself, which its getAnnotation()/updateObject() machinery requires (the
  # object form fails with "no item called package:... on the search list").
  ann <- tryCatch(
    as.data.frame(minfi::getAnnotation(pkg)),
    error = function(e) NULL
  )
  if (is.null(ann) || nrow(ann) == 0L) return(NULL)

  # First semicolon-separated token (UCSC_RefGene_* are multi-transcript lists).
  first_token <- function(x) {
    x <- as.character(x); x[is.na(x)] <- ""
    sub(";.*$", "", x)
  }

  # CHR: ChAMP uses the bare chromosome ("16"), minfi the UCSC form ("chr16").
  chr <- sub("^chr", "", as.character(ann$chr))

  gene <- first_token(ann$UCSC_RefGene_Name)

  # feature: gene region; empty => intergenic ("IGR"); spell like ChAMP.
  feature <- first_token(ann$UCSC_RefGene_Group)
  feature[!nzchar(feature)] <- "IGR"
  feature <- sub("^5UTR$", "5'UTR", feature)
  feature <- sub("^3UTR$", "3'UTR", feature)
  feature <- sub("^exon_.*$", "ExonBnd", feature)

  # cgi: CpG-island relation, lowercased to ChAMP's vocabulary
  # (Island/OpenSea/Shelf/Shore -> island/opensea/shelf/shore).
  cgi <- tolower(as.character(ann$Relation_to_Island))
  cgi[!nzchar(cgi) | cgi == "na"] <- "opensea"

  strand <- as.character(ann$strand)
  strand <- ifelse(strand %in% c("+", "F"), "F",
                   ifelse(strand %in% c("-", "R"), "R", strand))

  data.frame(
    CHR      = chr,
    MAPINFO  = suppressWarnings(as.integer(ann$pos)),
    Strand   = strand,
    Type     = as.character(ann$Type),
    gene     = gene,
    feature  = feature,
    cgi      = cgi,
    feat.cgi = paste(feature, cgi, sep = "-"),
    row.names = rownames(ann),
    stringsAsFactors = FALSE
  )
}

#' Load the probe annotation for an array type (ChAMPdata first, minfi fallback).
#'
#' @param arraytype An array type (canonical or alias).
#' @return The \code{probe.features} data.frame, or \code{NULL} if neither source
#'   is available.
load_probe_features <- function(arraytype) {
  pf <- load_probe_features_champdata(arraytype)
  if (is.null(pf)) pf <- build_probe_features_minfi(arraytype)
  pf
}

#' Guarantee that ChAMP's global \code{probe.features} object is available.
#'
#' champ.DMP / champ.DMR reference a free variable \code{probe.features} that they
#' populate by calling \code{data(...)} into the \emph{global} environment. That
#' load is broken in practice: EPIC v1 / EPIC v2 dispatch to data sets that this
#' ChAMPdata build does not ship (\code{probe.features.epicv2} does not exist at
#' all), so \code{data()} only warns and \code{probe.features} is never created —
#' ChAMP then crashes with "object 'probe.features' not found". Only 450K works
#' out of the box.
#'
#' To make the pipeline immune to those internals we load (450K / EPIC v1) or
#' reconstruct from minfi (EPIC v2) the correct annotation ourselves and bind it
#' in the global environment BEFORE calling ChAMP. Because a package function
#' resolves free variables along namespace -> imports -> base -> \code{globalenv()},
#' and ChAMP's own \code{data()} defaults to \code{envir = .GlobalEnv}, our global
#' binding is exactly where ChAMP looks — and its failed \code{data()} call, being
#' only a warning, does not overwrite it.
#'
#' @param arraytype An array type (canonical or alias).
#' @return Invisibly the loaded \code{probe.features} data.frame.
#' @details Emits a fatal pipeline error if no annotation source is available, so
#'   ChAMP never runs into the confusing downstream "not found" error.
ensure_probe_features <- function(arraytype) {
  pf <- load_probe_features(arraytype)
  if (is.null(pf) || !is.data.frame(pf) || nrow(pf) == 0L) {
    emit_error(sprintf(
      "Could not load a probe annotation for arraytype '%s'. Neither a ChAMPdata data set nor a minfi annotation package was available.",
      normalize_arraytype(arraytype)
    ))
  }
  assign("probe.features", pf, envir = globalenv())
  invisible(pf)
}

#' Detect the array type from a minfi object's annotation.
#'
#' minfi sets the annotation when it reads the IDATs (it must, to load the right
#' manifest), so this is the authoritative platform detection.
#'
#' @param rgset A minfi object (e.g. an \code{RGChannelSet}).
#' @return One of the canonical array types, or \code{NA_character_} if it cannot
#'   be determined.
detect_array_type <- function(rgset) {
  arr <- tryCatch(as.character(minfi::annotation(rgset)[["array"]]),
                  error = function(e) "")
  if (length(arr) == 0L || is.na(arr)) arr <- ""
  # Order matters: "EPICv2" contains "EPIC", so test it first.
  if (grepl("EPICv2", arr, ignore.case = TRUE)) return("EPICv2")
  if (grepl("EPIC",   arr, ignore.case = TRUE)) return("EPICv1")
  if (grepl("450",    arr))                      return("450K")
  NA_character_
}

#' Persist the detected array type to \code{array_type.txt} in a job directory.
#'
#' A no-op (returns \code{FALSE}) when the type is missing/undetermined, so the
#' downstream steps simply fall back to their default.
#'
#' @param job_dir Job directory.
#' @param type Array type (canonical), or \code{NA}/empty to skip.
#' @return Invisibly \code{TRUE} if written, else \code{FALSE}.
write_array_type <- function(job_dir, type) {
  if (is.null(type) || length(type) != 1L || is.na(type) || !nzchar(type)) {
    return(invisible(FALSE))
  }
  writeLines(type, file.path(job_dir, ARRAY_TYPE_FILE))
  invisible(TRUE)
}

#' Resolve the array type for a downstream step.
#'
#' Prefers the value minfi detected during filtering
#' (\code{<job_dir>/array_type.txt}); otherwise uses \code{fallback}. The result
#' is always normalized to a canonical value.
#'
#' @param job_dir Job directory that may contain \code{array_type.txt}.
#' @param fallback Array type to use when the file is absent (e.g. a CLI default).
#' @return A canonical array type.
read_array_type <- function(job_dir, fallback = "EPICv2") {
  path <- file.path(job_dir, ARRAY_TYPE_FILE)
  raw  <- if (file.exists(path)) {
    line <- trimws(readLines(path, warn = FALSE))
    line <- line[nzchar(line)]
    if (length(line) > 0L) line[1] else fallback
  } else {
    fallback
  }
  normalize_arraytype(raw)
}
