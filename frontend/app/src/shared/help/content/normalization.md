## Why is normalization necessary?

Normalization is one of the most influential preprocessing steps in methylation
analysis. Its purpose is to **remove technical variation while preserving
genuine biological differences** between samples.

Technical variation may arise from:

- scanner effects
- laboratory processing
- dye bias
- chip-specific effects
- probe design differences

Without normalization, technical variation may be mistaken for biological
variation. The platform provides several normalization methods and displays
**density plots** and **PCA plots** to help compare their performance.

## How should I choose a method?

A good normalization method typically produces:

- similar sample distributions
- reduced technical variation
- improved clustering of biological groups
- fewer batch-related patterns

When reviewing PCA plots, samples should ideally cluster according to biological
conditions rather than technical variables. For most studies, NOOB provides a
robust and reliable starting point.

### NOOB

*Normal-Exponential Out-Of-Band* corrects background noise and dye-bias effects
between the red and green channels. It is widely used and generally recommended
as the **default** method for most datasets.

### SWAN

Adjusts for systematic differences between Infinium Type I and Type II probe
designs. It improves comparability across probe types and may be beneficial when
probe-design effects are prominent.

### Functional Normalization

Uses internal control probes to estimate and remove technical variation. It is
particularly useful for:

- cancer datasets
- large cohorts
- multi-batch studies
- heterogeneous tissue samples

### Quantile Normalization

Forces all samples to have identical statistical distributions. This can
effectively remove technical variation but **may also remove genuine biological
differences** if applied to highly heterogeneous datasets, so it should be
selected with care.
