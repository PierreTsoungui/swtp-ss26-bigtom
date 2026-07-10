## Why is normalization necessary?

Normalization is one of the most influential preprocessing steps in methylation
analysis. Its goal is to **remove technical variation while preserving real
biological differences** between samples.

Technical variation creeps in from:

- the two-colour (Red/Green) dye chemistry and dye bias
- background fluorescence and scanner differences
- the two Infinium probe designs (Type I vs. Type II)
- chip-, plate- and batch-level effects

Without normalization, this technical variation can be mistaken for biology. To
help you choose, the platform shows two previews per method: a **density plot**
(the distribution of beta values; well-normalized samples overlap closely) and
an interactive **PCA plot** (samples should group by biological condition, not by
technical factors).

**RAW** is shown only as an unnormalized baseline for comparison; pick one of the
methods below to actually normalize.

## How should I choose a method?

A good choice generally produces similar sample distributions, tighter
clustering of biological groups, and fewer technically driven patterns. When in
doubt, compare the PCA previews. For most studies, NOOB provides a robust and
reliable default.

### NOOB

_Normal-exponential out-of-band_ correction estimates background and dye bias
using out-of-band signal. It is widely used and is a safe default for most
datasets.

### SWAN

_Subset-quantile Within-Array Normalization_ reduces the systematic offset
between Type I and Type II probe designs, improving comparability across probe
types. Useful when probe-design effects are prominent.

### Functional Normalization (FunNorm)

Uses the array's internal control probes to model and remove technical variation.
It is well suited to datasets with large global differences (for example cancer
vs. normal tissue, large cohorts, or multi-batch studies).

### Quantile Normalization

Forces every sample to share an identical value distribution. This removes
technical variation effectively but **can also erase genuine biological
differences** when samples are expected to differ globally, so use it with care
on heterogeneous data.
