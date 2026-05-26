# generate_svd_plot.R
args <- commandArgs(trailingOnly = TRUE)
job_dir <- args[1]
input_rds <- args[2]   
output_png <- args[3]  
batch_var <- args[4]   

suppressPackageStartupMessages({
  library(minfi)
  library(ggplot2)
})

mat_path <- file.path(job_dir, input_rds)
mat_data <- readRDS(mat_path)

if (is(mat_data, "RGChannelSet") || is(mat_data, "RGChannelSetExtended")) {
  mat_data <- preprocessRaw(mat_data)
}

if (is(mat_data, "MethylSet") || is(mat_data, "GenomicMethylSet") || 
    is(mat_data, "RatioSet") || is(mat_data, "GenomicRatioSet")) {
  mat <- getBeta(mat_data)
} else {
  mat <- as.matrix(mat_data)
}

mat <- na.omit(mat)
targets <- read.metharray.sheet(job_dir, pattern = ".*SampleSheet.*\\.csv$")

# ── SAMPLESHEET AN MATRIX ANPASSEN ──────────────────────────────────────────
targets_ids <- paste0(targets$Slide, "_", targets$Array)
clean_mat_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(colnames(mat)))
clean_targets_ids <- gsub("_Grn.*|_Red.*|\\.idat.*", "", basename(targets_ids))
matches <- match(clean_mat_ids, clean_targets_ids)

if (any(is.na(matches)) || length(matches) != ncol(mat)) {
  targets <- targets[1:ncol(mat), , drop=FALSE]
} else {
  targets <- targets[matches, , drop=FALSE]
}
# ────────────────────────────────────────────────────────────────────────────

# PCA berechnen
row_vars <- apply(mat, 1, var)
top_probes <- head(order(row_vars, decreasing = TRUE), 5000)
# Falls die Matrix weniger als 5000 Zeilen hat
if(nrow(mat) < 5000) top_probes <- 1:nrow(mat)

pca <- prcomp(t(mat[top_probes, ]), scale. = TRUE)

pca_df <- data.frame(
  PC1 = pca$x[, 1],
  PC2 = pca$x[, 2],
  Batch = as.factor(targets[[batch_var]])
)

p <- ggplot(pca_df, aes(x = PC1, y = PC2, color = Batch)) +
  geom_point(size = 3, alpha = 0.8) +
  theme_minimal() +
  labs(
    title = paste("SVD / PCA Plot -", input_rds),
    subtitle = paste("Eingefärbt nach:", batch_var),
    x = "Principal Component 1",
    y = "Principal Component 2"
  ) +
  theme(legend.position = "bottom")

ggsave(file.path(job_dir, output_png), plot = p, width = 7, height = 5, dpi = 150)
cat(paste0('{"status": "plot_generated", "file": "', output_png, '"}\n'))