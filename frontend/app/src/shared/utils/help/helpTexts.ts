export const helpTexts = {
  upload: `What files are required for the analysis?

To perform a DNA methylation analysis, the platform requires both the raw microarray data and a corresponding sample sheet containing metadata about your samples.

The raw data must consist of Illumina IDAT files. For every biological sample, two files are required:
one Green channel file (*_Grn.idat)
one Red channel file (*_Red.idat)

The system automatically scans the selected directory and all subdirectories to identify matching file pairs.

In addition, a Sample Sheet must be provided in either CSV or Excel format. This file links the raw data to biological information such as disease status, treatment groups, sex, batch identifiers, plate information, or other experimental variables.

These metadata variables are essential because they are used throughout the workflow for:
sample grouping,
quality assessment,
batch effect detection,
batch correction,
differential methylation analysis,
heatmap annotation and visualization.

Before the analysis starts, the system validates all uploaded files. Missing IDAT pairs, corrupted files, unsupported formats, or samples without corresponding metadata will stop the analysis to prevent invalid results.`,

  filtering: `Why is filtering necessary?

Raw methylation array data often contains measurements that are technically unreliable or biologically problematic. If these measurements remain in the dataset, they can increase noise, reduce statistical power, and lead to misleading biological conclusions.

Filtering removes low-quality probes and samples before normalization and statistical testing, thereby improving the overall reliability of the analysis.

Each filtering step can be enabled or disabled individually depending on the requirements of your study.

Detection P-Value Filter
The Detection P-Value estimates whether the signal measured for a probe can be distinguished from background noise.
A low Detection P-Value indicates that the probe signal is likely to represent a true biological measurement, whereas higher values suggest increasing uncertainty.
The recommended threshold is 0.01.
Using a stricter threshold increases confidence in the remaining measurements but removes more probes. Using a more permissive threshold retains more data but may introduce additional noise into downstream analyses.
This filter is generally considered one of the most important quality-control steps in methylation array preprocessing.

Bead Count Filter
Each methylation probe is represented by multiple microscopic beads on the array. Probes supported by too few beads often produce unstable measurements.
Removing probes with low bead counts improves technical reliability and reduces measurement variability.
Stricter filtering improves data quality but may decrease the number of retained probes.

Non-CpG Filter
Most methylation studies focus on CpG methylation because CpG sites play a central role in gene regulation and epigenetic control.
Non-CpG probes target other genomic contexts that are usually not relevant for standard methylation studies.
Removing these probes reduces dataset complexity and focuses the analysis on biologically meaningful CpG methylation patterns.

SNP Filter
Some methylation probes overlap known genetic variants, also known as Single Nucleotide Polymorphisms (SNPs).
In these situations, differences in probe signal may result from underlying genetic variation rather than true methylation differences.
Removing SNP-associated probes helps ensure that detected signals reflect epigenetic changes rather than inherited DNA sequence differences.

Multi-Hit Filter
Multi-Hit probes bind to multiple genomic locations simultaneously.
Because the measured signal cannot be reliably assigned to a single genomic region, interpretation becomes ambiguous.
Removing these probes improves genomic specificity and increases confidence in downstream biological interpretation.

Sex Chromosome Filter
This filter removes probes located on chromosomes X and Y.
It is generally recommended when analyzing male and female samples together and sex is not the primary biological question.
Sex chromosomes contain strong methylation differences between males and females. If retained, these differences may dominate the analysis and obscure disease-related or treatment-related signals.
However, this filter should not be used when studying sex-specific biology or X- and Y-linked regulatory mechanisms.

Sample Quality Filter
In addition to evaluating individual probes, the system also evaluates the overall quality of each sample.
Samples with unusually high numbers of failed probes may indicate poor DNA quality, insufficient DNA quantity, contamination, or laboratory processing issues.
The system calculates a failure rate based on the proportion of probes failing quality criteria.
Samples exceeding the defined threshold are automatically removed.
Additionally, automated PCA-based outlier detection identifies samples whose methylation profiles differ strongly from the rest of the dataset. Such outliers often represent technical artifacts and may negatively affect downstream analyses.`,

  normalization: `Why is normalization necessary?

Normalization is one of the most influential preprocessing steps in methylation analysis.
Its purpose is to remove technical variation while preserving genuine biological differences between samples.

Technical variation may arise from:
scanner effects,
laboratory processing,
dye bias,
chip-specific effects,
probe design differences.

Without normalization, technical variation may be mistaken for biological variation.
The platform provides several normalization methods and displays density plots and PCA plots to help compare their performance.

How should I choose a normalization method?
A good normalization method typically produces:
similar sample distributions,
reduced technical variation,
improved clustering of biological groups,
fewer batch-related patterns.

When reviewing PCA plots, samples should ideally cluster according to biological conditions rather than technical variables.
For most studies, NOOB provides a robust and reliable starting point.

NOOB
NOOB (Normal-Exponential Out-Of-Band) corrects background noise and dye-bias effects between the red and green channels.
It is widely used and generally recommended as the default normalization method for most datasets.

SWAN
SWAN adjusts for systematic differences between Infinium Type I and Type II probe designs.
It improves comparability across probe types and may be beneficial for datasets where probe-design effects are prominent.

Functional Normalization
Functional Normalization uses internal control probes to estimate and remove technical variation.
It is particularly useful for:
cancer datasets,
large cohorts,
multi-batch studies,
heterogeneous tissue samples.

Quantile Normalization
Quantile Normalization forces all samples to have identical statistical distributions.
This approach can effectively remove technical variation but may also remove genuine biological differences if applied to highly heterogeneous datasets.
Care should therefore be taken when selecting this method.`,

  batchCorrection: `What are batch effects?

Batch effects are systematic technical differences that arise independently of biology.
Common sources include:
processing dates,
laboratory personnel,
array batches,
sample plates,
scanner runs.

If left uncorrected, batch effects can obscure genuine biological findings or create false-positive results.

Interpreting the SVD Heatmap
The SVD heatmap displays associations between metadata variables and principal components.
Each cell contains a statistical significance value indicating how strongly a variable contributes to variation in the dataset.
Strong associations between technical variables and major principal components often indicate the presence of batch effects.
The biological variable of interest should generally explain a substantial proportion of the observed variation.

When should batch correction be applied?
Batch correction should only be performed when evidence for technical batch effects exists.
The platform protects the selected biological variable from being removed during correction.
Applying batch correction unnecessarily may reduce or eliminate genuine biological signals.
Therefore, correction should always be based on evidence from PCA and SVD analyses rather than performed automatically.`,

  dmp: `DMP Analysis

Differentially Methylated Positions (DMPs) represent individual CpG sites showing statistically significant methylation differences between biological groups.

The analysis reports:
p-values,
adjusted p-values,
methylation differences,
effect sizes.

Because hundreds of thousands of CpGs are tested simultaneously, adjusted p-values should generally be used when interpreting significance.
A positive Delta Beta indicates higher methylation in the first group, whereas a negative Delta Beta indicates higher methylation in the second group.`,

  dmr: `DMR Analysis

Differentially Methylated Regions (DMRs) are genomic regions containing multiple neighbouring CpGs that exhibit coordinated methylation changes.

Compared with individual DMPs, DMRs often provide stronger biological evidence because regulatory processes usually affect groups of CpGs rather than isolated positions.

The analysis reports genomic coordinates, region size, number of CpGs, and significance metrics.`,

  tableExport: `Guide: Result Filtering & Table Export

The interactive table displays statistical results.
Column filters allow rapid identification of high-priority biological candidates.

Effect Size (Delta Beta / Mean Difference)
Represents the absolute methylation difference between experimental groups.
Scale:
-1.0 to +1.0
Example:
Delta Beta = 0.2
indicates a 20% methylation shift.
This helps exclude biologically insignificant fluctuations.

Log Fold Change (LOG_FC)
Represents the logarithmic ratio of methylation intensities between groups.

Downloading Analysis Results

All result tables can be exported as CSV files for downstream analysis, reporting, or archiving.
The exported dataset includes the currently selected result type and may also preserve active filters and sorting settings.
Unlike the web interface, which may display only a subset of rows for performance reasons, exported files always contain the complete dataset matching the selected criteria.
Before sharing exported results, users should verify that the selected filters and statistical thresholds match the intended analysis objectives.`,

  heatmap: `How should I interpret the heatmap?

Heatmaps provide a visual overview of methylation patterns across samples and genomic features.
Rows typically represent CpG sites or DMRs, while columns represent samples.
Color intensity reflects methylation levels.
Samples with similar methylation profiles are clustered together, allowing rapid visual identification of biological groups, technical artifacts, or unexpected sample relationships.
Heatmaps should always be interpreted together with the statistical results rather than as standalone evidence.`,
} as const;
