library(minfi)

# ── Progress-Hilfsfunktion ──────────────────────────────────────────────────
progress <- function(percent, step) {
  cat(sprintf('{"type":"progress","percent":%d,"step":"%s"}\n', percent, step))
  flush.connection(stdout())
}

# ── Argumente einlesen ──────────────────────────────────────────────────────
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop('{"type":"error","message":"Zu wenige Argumente. Erwartet: <job_dir> <method>"}')
}

job_dir <- args[1]
method  <- args[2]

VALID_METHODS <- c("noob", "quantile", "swan", "funnorm")

if (!method %in% VALID_METHODS) {
  stop(sprintf(
    '{"type":"error","message":"Ungültige Methode: %s. Erlaubt: %s"}',
    method, paste(VALID_METHODS, collapse = ", ")
  ))
}

progress(0, "Starte Normalisierung")

# ── filtered_data.rds laden ─────────────────────────────────────────────────
rds_path <- file.path(job_dir, "filtered_data.rds")

if (!file.exists(rds_path)) {
  stop(sprintf(
    '{"type":"error","message":"filtered_data.rds nicht gefunden in: %s"}',
    job_dir
  ))
}

progress(10, "Lade gefilterte Daten")
raw_data <- readRDS(rds_path)

# ── Normalisierung ──────────────────────────────────────────────────────────
progress(30, paste("Normalisiere mit Methode:", method))

normalized <- switch(method,
  "noob"     = preprocessNoob(raw_data),
  "quantile" = preprocessQuantile(raw_data),
  "swan"     = preprocessSWAN(raw_data),
  "funnorm"  = preprocessFunnorm(raw_data)
)

progress(70, "Extrahiere Beta-Werte")
beta <- getBeta(normalized)

# Sanity check
if (any(beta < 0 | beta > 1, na.rm = TRUE)) {
  stop('{"type":"error","message":"Beta-Werte ausserhalb des gueltigen Bereichs [0,1]"}')
}

# ── Speichern ───────────────────────────────────────────────────────────────
progress(85, "Speichere Ergebnisse")

saveRDS(beta, file.path(job_dir, "beta_matrix.rds"))

output_path <- file.path(job_dir, "output.csv")
write.csv(as.data.frame(beta), output_path, row.names = TRUE)

progress(100, "Normalisierung abgeschlossen")
cat(sprintf('{"type":"done","method":"%s","output":"%s"}\n', method, output_path))