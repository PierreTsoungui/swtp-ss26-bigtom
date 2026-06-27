## Why is filtering necessary?

Raw methylation array data often contains measurements that are technically
unreliable or biologically problematic. If these measurements remain in the
dataset, they can increase noise, reduce statistical power, and lead to
misleading biological conclusions.

Filtering removes low-quality probes and samples **before** normalization and
statistical testing, thereby improving the overall reliability of the analysis.
Each filtering step can be enabled or disabled individually depending on the
requirements of your study.

### Detection P-Value Filter

The Detection P-Value estimates whether the signal measured for a probe can be
distinguished from background noise. A *low* value indicates that the probe
signal likely represents a true biological measurement, whereas *higher* values
suggest increasing uncertainty.

- **Recommended threshold:** `0.01`
- A stricter threshold increases confidence but removes more probes.
- A more permissive threshold retains more data but may introduce noise.

This is generally considered one of the most important quality-control steps in
methylation array preprocessing.

### Bead Count Filter

Each probe is represented by multiple microscopic beads on the array. Probes
supported by too few beads often produce unstable measurements. Removing them
improves technical reliability and reduces measurement variability; stricter
filtering improves quality but may decrease the number of retained probes.

### Non-CpG Filter

Most studies focus on CpG methylation because CpG sites play a central role in
gene regulation and epigenetic control. Non-CpG probes target other genomic
contexts that are usually not relevant for standard studies. Removing them
reduces dataset complexity and focuses the analysis on biologically meaningful
CpG methylation patterns.

### SNP Filter

Some probes overlap known genetic variants (Single Nucleotide Polymorphisms).
There, differences in probe signal may result from genetic variation rather than
true methylation differences. Removing SNP-associated probes helps ensure that
detected signals reflect epigenetic changes rather than inherited DNA sequence
differences.

### Multi-Hit Filter

Multi-Hit probes bind to multiple genomic locations simultaneously. Because the
measured signal cannot be reliably assigned to a single region, interpretation
becomes ambiguous. Removing these probes improves genomic specificity and
increases confidence in downstream interpretation.

### Sex Chromosome Filter

This filter removes probes located on chromosomes **X** and **Y**.

- *Recommended* when analyzing male and female samples together and sex is not
  the primary question — strong sex-linked methylation differences could
  otherwise dominate the analysis and obscure disease- or treatment-related
  signals.
- *Not recommended* when studying sex-specific biology or X-/Y-linked regulatory
  mechanisms.

### Sample Quality Filter

In addition to evaluating individual probes, the system evaluates the overall
quality of each **sample**. Samples with unusually high numbers of failed probes
may indicate poor DNA quality, insufficient quantity, contamination, or
processing issues. A failure rate is calculated from the proportion of probes
failing quality criteria, and samples exceeding the defined threshold are
automatically removed.

Additionally, automated PCA-based outlier detection identifies samples whose
methylation profiles differ strongly from the rest of the dataset. Such outliers
often represent technical artifacts and may negatively affect downstream
analyses.
