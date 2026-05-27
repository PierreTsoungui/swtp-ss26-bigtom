# =========================
# LIBRARIES
# =========================
library(readxl)
library(readr)
library(minfi)

cat("=== START PIPELINE ===\n")

# =========================
# ARGUMENTS
# =========================
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop("Usage: Rscript data.R <SampleSheet> <IDAT_DIR>")
}

sample_sheet_path <- args[1]
idat_dirs <- args[-1]

cat("SampleSheet:", sample_sheet_path, "\n")
cat("IDAT dirs:", paste(idat_dirs, collapse=", "), "\n")

# =========================
# READ SAMPLE SHEET
# =========================
if (grepl("\\.csv$", sample_sheet_path)) {

  samples <- read_csv(
    sample_sheet_path,
    show_col_types = FALSE
  )

} else {

  samples <- read_excel(sample_sheet_path)
}

# Handle Illumina [Data] section
if ("[Data]" %in% samples[[1]]) {

  start <- which(samples[[1]] == "[Data]") + 1

  samples <- read_csv(
    sample_sheet_path,
    skip = start,
    show_col_types = FALSE
  )
}

colnames(samples) <- trimws(colnames(samples))

# =========================
# BUILD SAMPLE ID
# =========================
samples$SampleID <- paste0(
  as.character(samples$Sentrix_ID),
  "_",
  as.character(samples$Sentrix_Position)
)

cat("Samples from sheet:\n")
print(samples$SampleID)

# =========================
# FIND IDAT FILES
# =========================
all_files <- unlist(lapply(idat_dirs, function(d) {

  list.files(
    d,
    pattern = "\\.idat$",
    recursive = TRUE,
    full.names = TRUE
  )
}))

if (length(all_files) == 0) {
  stop("No IDAT files found")
}

cat("Total IDAT files:", length(all_files), "\n")

# Only Green channel
grn_files <- all_files[
  grepl("_Grn\\.idat$", all_files, ignore.case = TRUE)
]

cat("GRN files found:", length(grn_files), "\n")

# =========================
# MAP SAMPLE → BASENAME
# =========================
samples$Basename <- sapply(samples$SampleID, function(id) {

  hit <- grn_files[
    grepl(id, grn_files, fixed = TRUE)
  ]

  if (length(hit) == 0) {
    return(NA)
  }

  sub(
    "_Grn.*$",
    "",
    hit[1],
    ignore.case = TRUE
  )
})

# =========================
# FILTER VALID SAMPLES
# =========================
samples <- samples[!is.na(samples$Basename), ]
samples <- as.data.frame(samples)

cat("Valid samples after filtering:", nrow(samples), "\n")

if (nrow(samples) < 1) {
  stop("No valid samples found")
}

cat("Final SampleIDs:\n")
print(samples$SampleID)

cat("Final BaseNames:\n")
print(samples$Basename)

# =========================
# READ IDAT
# =========================
cat("Reading IDAT...\n")

raw_data <- read.metharray.exp(
  targets = samples,
  extended = TRUE,
  force = TRUE
)

cat("IDAT loaded successfully\n")

# =========================
# DETECT ARRAY TYPE
# =========================
cat("Detecting array type...\n")

array_type <- annotation(raw_data)["array"]

cat("Array type:", array_type, "\n")

if (array_type == "Unknown") {
  stop("Unknown array type")
}

# =========================
# LOAD MANIFEST
# =========================
pkg <- switch(
  array_type,

  "IlluminaHumanMethylationEPIC" =
    "IlluminaHumanMethylationEPICmanifest",

  "IlluminaHumanMethylationEPICv2" =
    "IlluminaHumanMethylationEPICv2manifest",

  "IlluminaHumanMethylation450k" =
    "IlluminaHumanMethylation450kmanifest",

  NULL
)

if (is.null(pkg)) {
  stop("No manifest package found")
}

if (!requireNamespace(pkg, quietly = TRUE)) {

  cat("Installing:", pkg, "\n")
}

library(pkg, character.only = TRUE)

cat("Manifest loaded:", pkg, "\n")

# =========================
# SAVE RAW DATA
# IMPORTANT:
# normalization methods need RGChannelSet
# =========================
saveRDS(
  raw_data,
  "/data/filtered_data.rds"
)

cat("Saved RAW filtered_data.rds\n")

# =========================
# OPTIONAL RAW PREPROCESSING
# For output.csv only
# =========================
cat("Running preprocessRaw...\n")

preprocessed_data <- preprocessRaw(raw_data)

beta <- getBeta(preprocessed_data)

# =========================
# SAVE CSV
# =========================
write.csv(
  beta,
  "/data/output.csv"
)

cat("Saved output.csv\n")

cat("=== DONE ===\n")