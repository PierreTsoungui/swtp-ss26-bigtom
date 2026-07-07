#FROM rocker/r-ver:4.4.3
#
## System-Abhängigkeiten für Bioconductor- und Tidyverse-Pakete
#RUN apt-get update && apt-get install -y \
#    libcurl4-openssl-dev \
#    libssl-dev \
#    libxml2-dev \
#    libgit2-dev \
#    libharfbuzz-dev \
#    libfribidi-dev \
#    libfreetype6-dev \
#    libpng-dev \
#    libtiff5-dev \
#    libjpeg-dev \
#    libfontconfig1-dev \
#    libbz2-dev \
#    liblzma-dev \
#    libhdf5-dev \
#    libxt-dev \
#    libwebp-dev \
#    build-essential wget git \
#    && rm -rf /var/lib/apt/lists/*
#
## Große Bioconductor-Annotationspakete (v. a. EPICv2anno.20a1.hg38, mehrere
## hundert MB) brechen mit R's Default-Download-Timeout von 60s an langsamen
## Mirrors ab und lassen den Build fehlschlagen. Timeout global & früh anheben,
## damit ALLE folgenden Installs (Annotationen, ChAMP, ComplexHeatmap …) greifen.
#RUN echo 'options(timeout = 1200)' >> /usr/local/lib/R/etc/Rprofile.site
#
## BiocManager für die stabile Version 3.20 initialisieren
#RUN R -e "install.packages('BiocManager', repos='https://cloud.r-project.org')" \
#    && R -e "BiocManager::install(version='3.20', ask=FALSE)"
#
## WICHTIGER BUGFIX: Verhindert Core-Dumps/Abstürze bei der Normalisierung im Docker-Container
#RUN R -e "BiocManager::install('preprocessCore', configure.args = '--disable-threading', force = TRUE, ask = FALSE)"
#
## Array-Annotationen (Manifest + Annotation) für ALLE unterstützten Plattformen
## explizit vorab installieren: 450K, EPIC v1 und EPIC v2. minfi erkennt den
## Array-Typ automatisch aus den IDATs und lädt das passende Paket nach — daher
## müssen alle drei deterministisch vorhanden sein (nicht nur transitiv via ChAMP).
#RUN R -e "BiocManager::install(c( \
#    'IlluminaHumanMethylation450kmanifest', \
#    'IlluminaHumanMethylation450kanno.ilmn12.hg19', \
#    'IlluminaHumanMethylationEPICmanifest', \
#    'IlluminaHumanMethylationEPICanno.ilm10b4.hg19', \
#    'IlluminaHumanMethylationEPICv2manifest', \
#    'IlluminaHumanMethylationEPICv2anno.20a1.hg38' \
#    ), update=FALSE, ask=FALSE)"
#
## ChAMP installieren (installiert minfi, limma, sva, DMRcate automatisch mit)
#RUN R -e "BiocManager::install('ChAMP', dependencies=TRUE, ask=FALSE)"
#
## Visualisierung und kllassische Datenverarbeitung nachladen (remotes hier direkt mit rein)
#RUN R -e "BiocManager::install('ComplexHeatmap', ask=FALSE)"
#RUN R -e "install.packages(c( \
#    'data.table','readxl','logger','progressr','tidyverse','RhpcBLASctl', 'remotes' \
#    ), repos='https://cloud.r-project.org')"
#
## ChAMP & ChAMPdata direkt aus dem Entwickler-Repository auf GitHub ziehen
## (Nutzt die eben installierten Abhängigkeiten und überschreibt nur den ChAMP-Kern)
#RUN R -e "remotes::install_github('YuanTian1991/ChAMPdata', upgrade='never')" \
#    && R -e "remotes::install_github('YuanTian1991/ChAMP', upgrade='never')"
#
#WORKDIR /app
#
## Automatischer Funktionstest JETZT ganz am Ende (prüft die gepatchte GitHub-Version!).
## Schlägt der Build fehl, wenn auch nur ein Plattform-Paket fehlt — so kann das
## Image niemals unbemerkt ohne 450K-/EPICv1-/EPICv2-Support ausgeliefert werden.
#RUN R -e " \
#    library(ChAMP);          cat('ChAMP (GitHub-Patch): OK\n'); \
#    library(minfi);          cat('minfi: OK\n'); \
#    pkgs <- c( \
#      'IlluminaHumanMethylation450kmanifest', \
#      'IlluminaHumanMethylation450kanno.ilmn12.hg19', \
#      'IlluminaHumanMethylationEPICmanifest', \
#      'IlluminaHumanMethylationEPICanno.ilm10b4.hg19', \
#      'IlluminaHumanMethylationEPICv2manifest', \
#      'IlluminaHumanMethylationEPICv2anno.20a1.hg38' \
#    ); \
#    for (p in pkgs) { \
#      if (!requireNamespace(p, quietly = TRUE)) stop(paste('MISSING annotation package:', p)); \
#      cat(p, ': OK\n'); \
#    }; \
#    cat('--- ALLE PAKETE (450K + EPICv1 + EPICv2) ERFOLGREICH INSTALLIERT & GEPRÜFT ---\n')"