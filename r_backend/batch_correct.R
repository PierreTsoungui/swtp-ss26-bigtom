# batch_correct.R
options(digits = 4)

args <- commandArgs(trailingOnly = TRUE)
job_dir <- args[1]
batch_var <- args[2]
covariates_str <- if(length(args) >= 3) args[3] else ""

emit_progress <- function(percent, step) {
  cat(paste0('{"progress": ', percent, ', "step": "', step, '"}\n'))
  flush.console()
}

emit_progress(10, "Lade Bioconductor-Pakete (sva & minfi)...")
suppressPackageStartupMessages({
  library(sva)
  library(minfi)
})

emit_progress(20, "Suche Samplesheet und lade Daten...")
csv_files <- list.files(job_dir, pattern = ".*SampleSheet.*\\.csv$", full.names = TRUE)
if (length(csv_files) == 0) {
  cat('{"error": "Samplesheet nicht gefunden"}\n')
  quit(status = 1)
}

targets <- read.metharray.sheet(job_dir, pattern = ".*SampleSheet.*\\.csv$")

data_path <- file.path(job_dir, "normalized_data.rds")
if (!file.exists(data_path)) {
  cat('{"error": "normalized_data.rds fehlt"}\n')
  quit(status = 1)
}
data_obj <- readRDS(data_path)

if (is(data_obj, "RGChannelSet") || is(data_obj, "RGChannelSetExtended")) {
  emit_progress(30, "Rohdaten-Objekt (RGChannelSet) erkannt. Konvertiere...")
  data_obj <- preprocessRaw(data_obj)
}

if (is(data_obj, "MethylSet") || is(data_obj, "GenomicMethylSet") || 
    is(data_obj, "RatioSet") || is(data_obj, "GenomicRatioSet")) {
  mat <- getBeta(data_obj)
} else {
  mat <- as.matrix(data_obj)
}

emit_progress(40, "Bereite Datenmatrix für ComBat vor...")
mat <- na.omit(mat)
row_vars <- apply(mat, 1, var)
mat <- mat[row_vars > 0, ]

emit_progress(45, "Synchronisiere Samplesheet mit verbleibenden Matrix-Spalten...")
targets_ids <- paste0(targets$Slide, "_", targets$Array)
clean_mat_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(colnames(mat)))
clean_targets_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(targets_ids))
matches <- match(clean_mat_ids, clean_targets_ids)

if (any(is.na(matches)) || length(matches) != ncol(mat)) {
  targets <- targets[1:ncol(mat), , drop=FALSE]
} else {
  targets <- targets[matches, , drop=FALSE]
}

# ── NEU: DYNAMISCHER CHECK DER KOVARIABLEN AUF >1 LEVEL ─────────────────────
emit_progress(50, "Valdiere Kovariablen-Level für Design-Matrix...")
valid_covariates <- c()

if (covariates_str != "" && !is.na(covariates_str)) {
  cov_list <- unlist(strsplit(covariates_str, ","))
  for (cov in cov_list) {
    if (cov %in% colnames(targets)) {
      distinct_levels <- length(unique(targets[[cov]]))
      if (distinct_levels >= 2) {
        valid_covariates <- c(valid_covariates, cov)
      } else {
        # Emittiert eine Warnung im Log, bricht aber nicht ab!
        emit_progress(52, paste0("Info: Ignoriere '", cov, "', da nur 1 Level vorhanden ist."))
      }
    }
  }
}

if (length(valid_covariates) > 0) {
  formula_str = paste("~", paste(valid_covariates, collapse = " + "))
  mod <- model.matrix(as.formula(formula_str), data = targets)
} else {
  mod <- model.matrix(~1, data = targets)
}
# ────────────────────────────────────────────────────────────────────────────

# ── NEU: SAFETY-NET FÜR BATCH-VARIABLE ──────────────────────────────────────
batch_vector <- targets[[batch_var]]
distinct_batches <- length(unique(batch_vector))

if (distinct_batches < 2) {
  emit_progress(60, "Warnung: Nur 1 Batch vorhanden. Überspringe ComBat-Korrektur...")
  corrected_mat <- mat
} else {
  emit_progress(60, "Starte ComBat Batch-Korrektur...")
  corrected_mat <- ComBat(dat = mat, batch = batch_vector, mod = mod, par.prior = TRUE)
}
# ────────────────────────────────────────────────────────────────────────────

emit_progress(90, "Speichere korrigierte Daten...")
saveRDS(corrected_mat, file = file.path(job_dir, "corrected_data.rds"))

emit_progress(100, "Batch-Korrektur erfolgreich abgeschlossen!")
quit(status = 0)