# Verwendete Bibliotheken

library(readxl)
library(readr)
library(minfi)

# Eingabeparameter übergeben
cat("Übergabe von Samplesheet und IDAT-Dateien\n")
args <- commandArgs(trailingOnly = TRUE)

if (length(args) < 2) {
  stop("Zu wenige Eingabeparameter!")
} else {
  sample_sheet_path <- args[1]
  idat_dirs <- args[-1]
}

# Einlesen von Samplesheet
cat("Einlesen von Samplesheet\n")

if (grepl("\\.csv$", sample_sheet_path)) {
  samples <- read_csv(sample_sheet_path, show_col_types = FALSE)
} else if (grepl("\\.xlsx$", sample_sheet_path)) {
  samples <- read_excel(sample_sheet_path)
  write.csv(samples, "converted_samples.csv", row.names = FALSE)
} else {
  stop("Nur CSV oder XLSX erlaubt")
}


if ("[Data]" %in% samples[[1]]) {
  data_start <- which(samples[[1]] == "[Data]") + 1
  samples <- read_csv(sample_sheet_path, skip = data_start, show_col_types = FALSE)
}

colnames(samples) <- trimws(colnames(samples))

# Alle IDAT-Dateien sammeln
all_files <- unlist(lapply(idat_dirs, function(d) {
  list.files(d, pattern = ".+_(Grn|Red)\\.idat$", recursive = TRUE, full.names = TRUE)
}))

if (length(all_files) == 0) {
  stop("Keine IDAT-Dateien gefunden")
}

# Basename
file_names <- basename(all_files)
base_names <- unique(sub("_(Grn|Red)\\.idat$", "", file_names))

# SampleID
if (!all(c("Sentrix_ID", "Sentrix_Position") %in% colnames(samples))) {
  stop("Sentrix_ID oder Sentrix_Position fehlt")
}

samples$SampleID <- paste0(samples$Sentrix_ID,"_",samples$Sentrix_Position)

# Samples filtern (verwendet vs ausgeschlossen)
valid_samples <- samples$SampleID %in% base_names
cat("Anzahl verwendeter Samples:", sum(valid_samples), "\n")
cat("Anzahl ausgeschlossener Samples:", sum(!valid_samples), "\n")
excluded_samples <- samples$SampleID[!valid_samples]
cat("Ausgeschlossene Samples:\n")
cat(paste(excluded_samples, collapse = " "), "\n")

# Zur SampleID wird angegeben, wo die jeweiligen Rohdaten sind
grn_files <- all_files[grepl("_Grn\\.idat$", all_files)]

samples$Basename <- sapply(samples$SampleID, function(id) {
  hit <- grn_files[grepl(paste0(id, "_Grn\\.idat$"), grn_files)]
  if (length(hit) == 0) {
    return(NA)
  }
  sub("_Grn\\.idat$", "", hit[1])
})

# Samples as Dataframe
samples <- as.data.frame(samples[!is.na(samples$Basename), ])

# Einlesen von IDAT-Dateien
raw_data <- read.metharray.exp(targets = samples, extended = TRUE, force = TRUE)

# Manifest automatisch erkennen und laden
# Erkennen von Chiptyp, Laden von passendem Manifestund Setzen von Annotation
load_manifest <- function(raw_data, samples) {
  array_type <- annotation(raw_data)["array"]
  cat("Erkannter Array-Typ:",array_type,"\n")
  if (array_type=="Unknown") {
    first_idat <- paste0(samples$Basename[1], "_Grn.idat")
    chip <- illuminaio::readIDAT(first_idat)$ChipType
    cat("ChipType aus IDAT:",chip,"\n")
    if (grepl("EPIC|8x5",chip)) {
      array_type <- "IlluminaHumanMethylationEPICv2"
      anno       <- "20a1.hg38"
    } else if (grepl("8x1",chip)) {
      array_type <- "IlluminaHumanMethylationEPIC"
      anno       <- "ilm10b4.hg19"
    } else if (grepl("12x1",chip)) {
      array_type <- "IlluminaHumanMethylation450k"
      anno       <- "ilmn12.hg19"
    } else {
      stop("Unbekannter ChipType: ", chip, "\nBitte Manifest manuell installieren.")
    }
    annotation(raw_data)["array"] <<- array_type
    annotation(raw_data)["annotation"] <<- anno
    cat("Array-Typ:",array_type,"\n")
    cat("Annotation:",anno,"\n")
    
  }
  
  pkg <- switch(array_type,
                "IlluminaHumanMethylation450k"   = "IlluminaHumanMethylation450kmanifest",
                "IlluminaHumanMethylationEPIC"   = "IlluminaHumanMethylationEPICmanifest",
                "IlluminaHumanMethylationEPICv2" = "IlluminaHumanMethylationEPICv2manifest",
                NULL
  )
  
  if (is.null(pkg)) {
    stop("Kein passendes Paket für Manifest gefunden !")
  }
  
  if (!requireNamespace(pkg,quietly=TRUE)) {
    cat("Installiere:",pkg,"\n")
  } else {
    cat("Package bereits installiert:",pkg,"\n")
  }
  
  library(pkg,character.only=TRUE)
  cat("Manifest geladen:",pkg,"\n")
  return(raw_data)
}


raw_data <- load_manifest(raw_data, samples)

if (!inherits(raw_data, "RGChannelSet")) {
  
  stop(
    "raw_data ist KEIN RGChannelSet!\n",
    "Aktuelle Klasse: ",
    paste(class(raw_data), collapse = ", ")
  )
}

cat("RGChannelSet erfolgreich erzeugt\n")


source("init_filter.R")


beta <- filter_raw_data(raw_data = raw_data, job_dir = ".", save_rds = TRUE)

write.csv(as.data.frame(beta), "output.csv", row.names = TRUE)

cat("Fertig! output.csv geschrieben\n")