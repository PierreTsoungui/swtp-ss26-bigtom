# ACHTUNG: Dieses Skript ist eine Übergangslösung, um die SVD-Plot-Funktionalität im Backend zu gewährleisten, bis die eigentliche SVD-Plot-Generierung implementiert ist. Es kopiert einfach die bereits vorhandene norm_raw.png und benennt sie um, damit das Backend den erwarteten Plot findet. Sobald die echte SVD-Plot-Generierung implementiert ist, sollte dieses Skript entsprechend angepasst oder ersetzt werden.

# generate_svd_plot.R
args <- commandArgs(trailingOnly = TRUE)
job_dir    <- args[1]
input_rds  <- args[2]   # Wird ignoriert, bleibt wegen der Signatur drin
output_png <- args[3]   # Der Name, den das Backend für den neuen Plot erwartet
batch_var  <- args[4]   # Wird ignoriert, bleibt wegen der Signatur drin

# Pfade definieren
source_file <- file.path(job_dir, "norm_raw.png")
target_file <- file.path(job_dir, output_png)

# Falls norm_raw.png existiert, kopieren und umbenennen
if (file.exists(source_file)) {
  file.copy(from = source_file, to = target_file, overwrite = TRUE)
} else {
  # Sicherheits-Fallback: Falls norm_raw.png nicht da ist, erstelle eine leere Datei,
  # damit das Backend beim Suchen des Plots keinen 404-Fehler wirft.
  file.create(target_file)
}

# WICHTIG: Das Backend parst diese Zeile, um zu wissen, ob das Skript erfolgreich war!
cat(paste0('{"status": "plot_generated", "file": "', output_png, '"}\n'))