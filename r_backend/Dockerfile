FROM rocker/r-ver:4.4.3

# System-Abhängigkeiten für Bioconductor- und Tidyverse-Pakete
RUN apt-get update && apt-get install -y \
    libcurl4-openssl-dev \
    libssl-dev \
    libxml2-dev \
    libgit2-dev \
    libharfbuzz-dev \
    libfribidi-dev \
    libfreetype6-dev \
    libpng-dev \
    libtiff5-dev \
    libjpeg-dev \
    libfontconfig1-dev \
    libbz2-dev \
    liblzma-dev \
    libhdf5-dev \
    libxt-dev \
    libwebp-dev \
    build-essential wget git \
    && rm -rf /var/lib/apt/lists/*

# BiocManager für die stabile Version 3.20 initialisieren
RUN R -e "install.packages('BiocManager', repos='https://cloud.r-project.org')" \
    && R -e "BiocManager::install(version='3.20', ask=FALSE)"

# WICHTIGER BUGFIX: Verhindert Core-Dumps/Abstürze bei der Normalisierung im Docker-Container
RUN R -e "BiocManager::install('preprocessCore', configure.args = '--disable-threading', force = TRUE, ask = FALSE)"

# EPICv2 Annotationsdaten vorab installieren
RUN R -e "BiocManager::install(c( \
    'IlluminaHumanMethylationEPICv2manifest', \
    'IlluminaHumanMethylationEPICv2anno.20a1.hg38' \
    ), ask=FALSE)"

# ChAMP installieren (installiert minfi, limma, sva, DMRcate automatisch mit)
RUN R -e "BiocManager::install('ChAMP', dependencies=TRUE, ask=FALSE)"

# Visualisierung und klassische Datenverarbeitung nachladen (remotes hier direkt mit rein)
RUN R -e "BiocManager::install('ComplexHeatmap', ask=FALSE)"
RUN R -e "install.packages(c( \
    'data.table','readxl','logger','progressr','tidyverse','RhpcBLASctl', 'remotes' \
    ), repos='https://cloud.r-project.org')"

# ChAMP & ChAMPdata direkt aus dem Entwickler-Repository auf GitHub ziehen
# (Nutzt die eben installierten Abhängigkeiten und überschreibt nur den ChAMP-Kern)
RUN R -e "remotes::install_github('YuanTian1991/ChAMPdata', upgrade='never')" \
    && R -e "remotes::install_github('YuanTian1991/ChAMP', upgrade='never')"

WORKDIR /app

# Automatischer Funktionstest JETZT ganz am Ende (prüft die gepatchte GitHub-Version!)
RUN R -e " \
    library(ChAMP);          cat('ChAMP (GitHub-Patch): OK\n'); \
    library(minfi);          cat('minfi: OK\n'); \
    library(IlluminaHumanMethylationEPICv2manifest); cat('EPICv2 Manifest: OK\n'); \
    cat('--- ALLE PAKETE ERFOLGREICH INSTALLIERT & GEPRÜFT ---\n')"