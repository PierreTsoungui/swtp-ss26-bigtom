FROM rocker/r-ver:4.4.1

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
    build-essential wget git \
    # ── BLAS mono-thread ──
    libblas-dev \
    liblapack-dev \
    && rm -rf /var/lib/apt/lists/*

# ─────────────────────────────────────────────
# BLAS mono-thread : remplace OpenBLAS par le
# BLAS de référence pour éviter pthread_create()
# error 22 dans Docker avec minfi/preprocessQuantile
# preprocessFunnorm qui créent des threads BLAS
# indépendamment de BiocParallel
# ─────────────────────────────────────────────
RUN update-alternatives --set \
    libblas.so.3-x86_64-linux-gnu \
    /usr/lib/x86_64-linux-gnu/blas/libblas.so.3 \
    && update-alternatives --set \
    liblapack.so.3-x86_64-linux-gnu \
    /usr/lib/x86_64-linux-gnu/lapack/liblapack.so.3

RUN R -e "install.packages('BiocManager', repos='https://cloud.r-project.org')"
RUN R -e "BiocManager::install(version='3.20', ask=FALSE)"

# EPICv2 Annotation
RUN R -e "BiocManager::install(c( \
    'IlluminaHumanMethylationEPICv2manifest', \
    'IlluminaHumanMethylationEPICv2anno.20a1.hg38' \
    ), ask=FALSE)"

# Kernanalyse
RUN R -e "BiocManager::install(c( \
    'minfi','limma','sva','DMRcate','bumphunter' \
    ), dependencies=TRUE, ask=FALSE, force=TRUE)"

# Visualisierung
RUN R -e "BiocManager::install(c( \
    'ggplot2','ComplexHeatmap' \
    ), ask=FALSE)"

# System-Abhängigkeit für tidyverse
RUN apt-get update && apt-get install -y \
    libxt-dev \
    libwebp-dev \
    && rm -rf /var/lib/apt/lists/*

# Datenverarbeitung
RUN R -e "install.packages(c( \
    'data.table','readxl','logger','progressr' \
    ), repos='https://cloud.r-project.org')"

RUN R -e "install.packages('tidyverse', repos='https://cloud.r-project.org')"

# Verifikation BLAS
RUN R -e "sessionInfo()" | grep -i blas || true

# Verifikation
RUN R -e "cat('All R packages installed successfully\n')"