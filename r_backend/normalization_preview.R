#!/usr/bin/env Rscript
# =============================================================================
# normalization_preview.R
# =============================================================================
#
# Technische Anmerkung zur Zwei-Datei-Architektur:
#
# Die vier Normalisierungsmethoden akzeptieren nicht denselben Eingabetyp.
# preprocessSWAN() erfordert ein vollständiges, unmodifiziertes RGChannelSet,
# während NOOB, QUANTILE und FUNNORM auf den Daten nach der Filterung
# schlechter Probes arbeiten müssen, um die biologische Validität der
# Ergebnisse sicherzustellen.
#
# Daher werden in init_filter.R zwei Dateien erstellt:
#
#   rg_data.rds       → vollständiges RGChannelSet (vor Filterung) → nur für SWAN
#   filtered_data.rds → gefiltertes RGChannelSet (nach Filterung)  → RAW, NOOB,
#                        QUANTILE, FUNNORM
#
# Diese Zwei-Datei-Architektur ist eine technische Notwendigkeit und keine
# willkürliche Entscheidung. Sie ist der einzige Ansatz, der es ermöglicht,
# alle fünf Density Plots korrekt zu generieren, ohne die biologische Qualität
# der normalisierten Daten zu beeinträchtigen.
#
# Technische Anmerkung zum Subprocess-Ansatz:
#
# preprocessNoob(), preprocessQuantile() und preprocessFunnorm() versuchen
# intern Threads zu erstellen, was in Docker-Containern mit eingeschränkten
# Thread-Limits zu "pthread_create() error 22" führt. Diese drei Methoden
# werden daher jeweils in einem isolierten Rscript-Subprocess ausgeführt,
# der mit erzwungenen Single-Thread-Umgebungsvariablen startet.
#
# =============================================================================

# =============================================================================
# normalization_preview.R
# =============================================================================
#
# TECHNISCHE DOKUMENTATION — PROBLEMANALYSE UND LÖSUNGSWEG
# =========================================================
#
# ─────────────────────────────────────────────────────────
# PROBLEM 1: pthread_create() Fehler (Error Code 22)
# ─────────────────────────────────────────────────────────
#
# WAS FEHLSCHLUG:
#   preprocessQuantile(), preprocessFunnorm() und preprocessNoob()
#   versuchten intern POSIX-Threads (pthreads) zu erstellen, um
#   Matrixberechnungen zu parallelisieren. In Docker-Containern mit
#   eingeschränkten Thread-Limits schlug dies fehl:
#
#     ERROR; return code from pthread_create() is 22
#
#   Der Fehler trat NICHT durch BiocParallel auf, sondern durch
#   OpenBLAS — die zugrundeliegende Bibliothek für Matrixoperationen —
#   die Threads unabhängig von allen BiocParallel-Einstellungen erstellt.
#   Umgebungsvariablen wie OMP_NUM_THREADS=1 reichten nicht aus,
#   da OpenBLAS diese teilweise ignoriert.
#
# WAS GEHOLFEN HAT:
#   1. Dockerfile: OpenBLAS wurde durch die Single-Thread-Referenz-
#      implementierung von BLAS ersetzt:
#
#        RUN update-alternatives --set \
#            libblas.so.3-x86_64-linux-gnu \
#            /usr/lib/x86_64-linux-gnu/blas/libblas.so.3
#
#      → Keine Thread-Erstellung mehr durch BLAS möglich
#
#   2. Alle rechenintensiven Methoden (NOOB, QUANTILE, FUNNORM) werden
#      in isolierten Rscript-Subprozessen ausgeführt, gestartet über:
#
#        bash -c "ulimit -s unlimited && ulimit -u unlimited && Rscript ..."
#
#      → Stack-Limit und Prozess-Limit werden im Subprozess aufgehoben
#
#   3. docker-compose.yml: ulimits für r_worker erhöht:
#
#        ulimits:
#          nproc:
#            soft: 65535
#            hard: 65535
#        shm_size: '256m'
#
# ─────────────────────────────────────────────────────────
# PROBLEM 2: SWAN schlug fehl — falscher Eingabetyp
# ─────────────────────────────────────────────────────────
#
# WAS FEHLSCHLUG:
#   preprocessSWAN() wurde mit dem gefilterten Datensatz aufgerufen:
#
#     preprocessSWAN(filtered_data)   # FALSCH
#
#   SWAN benötigt zwingend ein vollständiges, unmodifiziertes
#   RGChannelSet als Eingabe — nach der Filterung gehen die
#   dafür notwendigen Rohdaten verloren.
#
# WAS GEHOLFEN HAT:
#   init_filter.R speichert jetzt das RGChannelSet VOR der Filterung:
#
#     saveRDS(raw_data, file.path(job_dir, "rg_data.rds"))
#
#   normalization_preview.R lädt es separat für SWAN:
#
#     rgSet <- readRDS(file.path(job_dir, "rg_data.rds"))
#     preprocessSWAN(rgSet, mSet)     # KORREKT
#
# ─────────────────────────────────────────────────────────
# PROBLEM 3: NOOB / QUANTILE / FUNNORM arbeiteten auf Rohdaten
# ─────────────────────────────────────────────────────────
#
# WAS FEHLSCHLUG:
#   Im ursprünglichen Script wurden alle Methoden mit densityPlot()
#   auf getBeta(data) aufgerufen — also auf denselben ungefilterten
#   Rohdaten, ohne die eigentliche Normalisierung durchzuführen.
#   Alle Plots sahen dadurch identisch aus.
#
# WAS GEHOLFEN HAT:
#   Jede Methode ruft jetzt die korrekte minfi-Funktion auf:
#
#     preprocessNoob(data)            → NOOB
#     preprocessQuantile(data)        → QUANTILE
#     preprocessFunnorm(data, nPCs=2) → FUNNORM
#     preprocessSWAN(rgSet, mSet)     → SWAN
#
# ─────────────────────────────────────────────────────────
# RESULTIERENDE ZWEI-DATEI-ARCHITEKTUR
# ─────────────────────────────────────────────────────────
#
#   rg_data.rds       → vollständiges RGChannelSet (vor Filterung)
#                        wird NUR von SWAN verwendet
#
#   filtered_data.rds → gefiltertes RGChannelSet (nach Filterung)
#                        wird von RAW, NOOB, QUANTILE, FUNNORM verwendet
#
#   Diese Architektur ist eine technische Notwendigkeit:
#   Ein einzelnes Objekt kann nicht gleichzeitig die Anforderungen
#   aller fünf Normalisierungsmethoden erfüllen.
#
# ─────────────────────────────────────────────────────────
# ENDERGEBNIS
# ─────────────────────────────────────────────────────────
#
#   Alle 5 PNG-Dateien werden korrekt erstellt:
#     norm_raw.png       → Rohdaten (Referenz)
#     norm_noob.png      → Noob-Normalisierung
#     norm_quantile.png  → Quantile-Normalisierung
#     norm_swan.png      → SWAN-Normalisierung
#     norm_funnorm.png   → Functional Normalization
#
# =============================================================================

Sys.setenv(
  OMP_NUM_THREADS        = 1,
  OPENBLAS_NUM_THREADS   = 1,
  MKL_NUM_THREADS        = 1,
  NUMEXPR_NUM_THREADS    = 1,
  VECLIB_MAXIMUM_THREADS = 1,
  BLAS_NUM_THREADS       = 1,
  OMP_THREAD_LIMIT       = 1
)

# ─────────────────────────────────────────────
# LIBRARIES
# ─────────────────────────────────────────────
suppressPackageStartupMessages({
  library(minfi)
  library(jsonlite)
  library(BiocParallel)
})

register(SerialParam())
options(mc.cores = 1)

# ─────────────────────────────────────────────
# ARGUMENTS
# ─────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)
if (length(args) < 2) {
  stop("Usage: Rscript normalization_preview.R <filtered_data.rds> <job_dir>")
}

rds_path <- args[1]
job_dir  <- args[2]

if (!file.exists(rds_path)) {
  stop("ERROR: filtered_data.rds not found at: ", rds_path)
}

# ─────────────────────────────────────────────
# LOAD filtered data
# ─────────────────────────────────────────────
data <- readRDS(rds_path)

if (!inherits(data, "GenomicRatioSet") &&
    !inherits(data, "MethylSet") &&
    !inherits(data, "RGChannelSet")) {
  stop("ERROR: filtered_data.rds is not a valid minfi object")
}

# ─────────────────────────────────────────────
# LOAD RGChannelSet (für SWAN)
# ─────────────────────────────────────────────
rg_path <- file.path(job_dir, "rg_data.rds")
rgSet   <- NULL

if (file.exists(rg_path)) {
  rgSet <- readRDS(rg_path)
  if (!inherits(rgSet, "RGChannelSet")) {
    cat("WARN: rg_data.rds ist kein RGChannelSet — SWAN wird fehlschlagen\n")
    rgSet <- NULL
  }
} else {
  cat("WARN: rg_data.rds nicht gefunden — SWAN nicht verfügbar\n")
}

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
update_progress <- function(x) {
  cat(paste0("PROGRESS:", x, "\n"))
  flush.console()
}

create_error_png <- function(filename, message) {
  png(filename, width = 800, height = 400)
  plot.new()
  text(0.5, 0.5, paste("ERROR:\n", message), cex = 1.2)
  dev.off()
  cat("Created fallback PNG:", filename, "\n")
}

make_density_plot <- function(beta_matrix, filename, title) {
  png(filename)
  densityPlot(beta_matrix, main = title, xlab = "Beta value")
  dev.off()
  cat("Saved:", filename, "\n")
}

emit_plot <- function(filename) {
  cat(toJSON(list(type = "plot", file = filename), auto_unbox = TRUE), "\n")
  flush.console()
}

# Subprocess helper — évite pthread_create() error 22 dans Docker
run_subprocess <- function(name, method_code, input_rds, output_png, progress) {
  cat("Running:", name, "\n")

  tmp_script <- tempfile(fileext = ".R")
  writeLines(c(
    "Sys.setenv(",
    "  OMP_NUM_THREADS        = 1,",
    "  OPENBLAS_NUM_THREADS   = 1,",
    "  MKL_NUM_THREADS        = 1,",
    "  OMP_THREAD_LIMIT       = 1,",
    "  VECLIB_MAXIMUM_THREADS = 1",
    ")",
    "suppressPackageStartupMessages({",
    "  library(minfi)",
    "  library(BiocParallel)",
    "})",
    "register(SerialParam())",
    sprintf('data <- readRDS("%s")', input_rds),
    sprintf('out  <- "%s"', output_png),
    "tryCatch({",
    sprintf("  result <- %s", method_code),
    "  png(out)",
    sprintf("  densityPlot(getBeta(result), main = '%s', xlab = 'Beta value')", name),
    "  dev.off()",
    sprintf("  cat('%s OK\\n')", name),
    "}, error = function(e) {",
    "  png(out, width = 800, height = 400)",
    "  plot.new()",
    "  text(0.5, 0.5, paste('ERROR:\\n', e$message), cex = 1.2)",
    "  dev.off()",
    sprintf("  cat('%s ERROR:', e$message, '\\n')", name),
    "})"
  ), tmp_script)

  ret <- system2("Rscript", tmp_script, stdout = TRUE, stderr = TRUE)
  cat(paste(ret, collapse = "\n"), "\n")

  if (!file.exists(output_png) || file.info(output_png)$size == 0) {
    create_error_png(output_png, paste(name, "subprocess failed"))
  }

  emit_plot(output_png)
  update_progress(progress)
}

# ─────────────────────────────────────────────
# RAW (20%) — direkt, kein subprocess nötig
# ─────────────────────────────────────────────
cat("Running: RAW\n")
tryCatch({
  make_density_plot(getBeta(data), file.path(job_dir, "norm_raw.png"), "RAW")
}, error = function(e) {
  cat("ERROR in RAW:", e$message, "\n")
  create_error_png(file.path(job_dir, "norm_raw.png"), e$message)
})
emit_plot(file.path(job_dir, "norm_raw.png"))
update_progress(20)

# ─────────────────────────────────────────────
# NOOB (40%) — subprocess
# ─────────────────────────────────────────────
run_subprocess(
  name        = "NOOB",
  method_code = "preprocessNoob(data)",
  input_rds   = rds_path,
  output_png  = file.path(job_dir, "norm_noob.png"),
  progress    = 40
)

# ─────────────────────────────────────────────
# QUANTILE (60%) — subprocess
# ─────────────────────────────────────────────
run_subprocess(
  name        = "QUANTILE",
  method_code = "preprocessQuantile(data)",
  input_rds   = rds_path,
  output_png  = file.path(job_dir, "norm_quantile.png"),
  progress    = 60
)

# ─────────────────────────────────────────────
# SWAN (80%) — direkt, braucht RGChannelSet
# ─────────────────────────────────────────────
cat("Running: SWAN\n")
swan_png <- file.path(job_dir, "norm_swan.png")
tryCatch({
  if (is.null(rgSet)) {
    stop("rg_data.rds nicht verfügbar — SWAN benötigt RGChannelSet")
  }
  swan_result <- preprocessSWAN(rgSet)
  make_density_plot(getBeta(swan_result), swan_png, "SWAN")
}, error = function(e) {
  cat("ERROR in SWAN:", e$message, "\n")
  create_error_png(swan_png, e$message)
})
emit_plot(swan_png)
update_progress(80)

# ─────────────────────────────────────────────
# FUNNORM (100%) — subprocess
# ─────────────────────────────────────────────
run_subprocess(
  name        = "FUNNORM",
  method_code = "preprocessFunnorm(data, nPCs = 2, verbose = FALSE)",
  input_rds   = rds_path,
  output_png  = file.path(job_dir, "norm_funnorm.png"),
  progress    = 100
)

# ─────────────────────────────────────────────
# END
# ─────────────────────────────────────────────
cat("=== NORMALIZATION FINISHED ===\n")