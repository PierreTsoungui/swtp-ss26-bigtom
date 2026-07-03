## DMP Analysis

**Differentially Methylated Positions (DMPs)** are individual CpG sites whose
methylation differs significantly between the two groups you compare. You choose
the grouping column and which value is the **case** and which is the **control**.

### What the analysis reports

For every CpG, the analysis provides:

- the **p-value** and the **adjusted p-value** (corrected for multiple testing)
- the group means (case and control)
- **Delta Beta (Δβ)** — the methylation difference, computed as case minus
  control, on the 0–1 beta scale (so `0.2` means a 20 percentage-point change)
- **log fold change** — the log2 ratio of the group means

### How to read the results

Because hundreds of thousands of CpGs are tested at once, always judge
significance by the **adjusted p-value**, not the raw p-value. The effect size
(Δβ) tells you whether a statistically significant change is also biologically
meaningful.

A positive Delta Beta indicates higher methylation in the first group (the
case), while a negative value indicates higher methylation in the second group
(the control).

All CpGs are kept in the table; you apply significance and effect-size cutoffs
yourself using the column filters, so nothing is silently discarded.
