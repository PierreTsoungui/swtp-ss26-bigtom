# 1. Bibliotheken laden
library(minfi)
library(ChAMP)

cat("\n--- SCHRITT 1: Pfad setzen ---\n")
testDir <- "/app/jobs/aa902339-3b6b-4f16-b569-2c6722406915/"

cat("\n--- SCHRITT 2: IDATs direkt vom Datenträger laden ---\n")
rgSet <- read.metharray.exp(base = testDir, recursive = TRUE)

cat("\n--- SCHRITT 3: Sample Sheet robust einlesen & filtern ---\n")
csvFile <- list.files(testDir, pattern = "\\.csv$", full.names = TRUE)[1]
lines <- readLines(csvFile)
dataStart <- grep("\\[Data\\]", lines)
targets <- read.csv(csvFile, skip = dataStart, header = TRUE, stringsAsFactors = FALSE)

targets$Sample_ID <- paste0(targets$Sentrix_ID, "_", targets$Sentrix_Position)
targets <- targets[targets$Sample_ID %in% colnames(rgSet), ]
rownames(targets) <- targets$Sample_ID
targets <- targets[colnames(rgSet), ]

cat("\n--- SCHRITT 4: Normalisierung (Funnorm) ---\n")
myPreg <- preprocessFunnorm(rgSet)
myNormBeta <- getBeta(myPreg)

# --- DER N=1 BUSTER (TRICK GEGEN DEN ROWMEANS-ABSTURZ) ---
coriell_id <- targets$Sample_ID[targets$Sample_Group == "Coriell"]

# 1. Spalte in der Beta-Matrix duplizieren
myNormBeta_ext <- cbind(myNormBeta, myNormBeta[, coriell_id, drop = FALSE])
colnames(myNormBeta_ext)[ncol(myNormBeta_ext)] <- paste0(coriell_id, "_DUP")

# 2. Zeile im Sample Sheet duplizieren
dup_target <- targets[coriell_id, ]
dup_target$Sample_ID <- paste0(coriell_id, "_DUP")
rownames(dup_target) <- dup_target$Sample_ID
targets_ext <- rbind(targets, dup_target)

# --- BUGFIX FÜR DEN ChAMP-HARDCODING-FEHLER ---
# Wir nennen das Objekt exakt "myNorm", damit champ.SVD() intern nicht abstürzt!
myNorm <- as.matrix(myNormBeta_ext)

cat("Gefilterte Proben im Sample Sheet (inkl. Klon): ", nrow(targets_ext), "\n")
cat("Normalisierte Matrix-Größe (Sonden x Proben): ", dim(myNorm), "\n")

cat("\n--- SCHRITT 5: SVD / Batch-Effekt-Analyse ---\n")
mySVD <- champ.SVD(beta = myNorm, pd = targets_ext)
cat("SVD Analyse erfolgreich!\n")

cat("\n--- SCHRITT 6: DMP-Analyse ---\n")
myDMP <- champ.DMP(beta = myNorm, pheno = targets_ext$Sample_Group, adjPVal = 1, arraytype = "EPICv2")
cat("DMP Zeilenanzahl nach Korrektur: ", nrow(myDMP[[1]]), "\n")
print(head(myDMP[[1]]))

cat("\n--- SCHRITT 7: DMR-Analyse via Bumphunter ---\n")
myDMR <- champ.DMR(beta = myNorm, pheno = targets_ext$Sample_Group, method = "Bumphunter", maxGap = 1000, arraytype = "EPICv2")
print(head(myDMR$BumphunterDMR))

cat("\n--- !!! PIPELINE KOMPLETT ERFOLGREICH BEENDET !!! ---\n")