library(minfi)

# ── Progress Vertrag einbinden ───────────────────────────────────────────────
source("/app/r_backend/utils/progress.R")

# ── Argumente einlesen ──────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  emit_error("Zu wenige Argumente. Erwartet: <job_dir> <method>")
}

job_dir <- args[1]
method  <- args[2]

VALID_METHODS <- c("noob", "quantile", "swan", "funnorm")

if (!method %in% VALID_METHODS) {
  emit_error(sprintf(
    "Ungültige Methode: %s. Erlaubt: %s",
    method, paste(VALID_METHODS, collapse = ", ")
  ))
}

# Gemäß Entwickler-Checkliste Punkt 2: Initialisierung melden
emit_progress(0, "Starte Normalisierung")

# ── filtered_data.rds laden ─────────────────────────────────────────────────
rds_path = file.path(job_dir, "filtered_data.rds")

if (!file.exists(rds_path)) {
  emit_error(sprintf(
    "filtered_data.rds nicht gefunden in: %s",
    job_dir
  ))
}

emit_progress(10, "Lade gefilterte Daten")
raw_data <- readRDS(rds_path)

# ── Normalisierung ──────────────────────────────────────────────────────────
emit_progress(30, paste("Normalisiere mit Methode:", method))

# Fixed seed for reproducibility: preprocessSWAN() randomly subsets probes and is
# otherwise non-deterministic — without a seed, two runs of the same data produce
# slightly different beta values, which then propagate into the DMP/DMR averages,
# Δβ magnitudes and p-values. The other methods are deterministic; seeding is
# harmless for them.
set.seed(42)

normalized <- switch(method,
  "noob"     = preprocessNoob(raw_data),
  "quantile" = preprocessQuantile(raw_data),
  "swan"     = preprocessSWAN(raw_data),
  "funnorm"  = preprocessFunnorm(raw_data)
)

# ── Validierung (Sanity Check) ──────────────────────────────────────────────
emit_progress(70, "Überprüfe Datenqualität")
beta_check <- getBeta(normalized)

if (any(beta_check < 0 | beta_check > 1, na.rm = TRUE)) {
  emit_error("Beta-Werte ausserhalb des gueltigen Bereichs [0,1]")
}
rm(beta_check) # Speicher direkt wieder freigeben

# ── Speichern ───────────────────────────────────────────────────────────────
emit_progress(85, "Speichere normalisiertes Objekt")

# WICHTIG: Wir speichern das ganze minfi-Objekt, damit spätere Skripte 
# alle Annotationen und Metadaten behalten!
output_rds <- file.path(job_dir, "normalized_data.rds")
saveRDS(normalized, output_rds)

# Finale Erfolgsmeldung und anschließendes Done-Signal an das Backend senden
emit_progress(100, "Normalisierung abgeschlossen")
emit_done(method = method, output = output_rds)