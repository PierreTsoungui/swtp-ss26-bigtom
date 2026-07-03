## Result Filtering & Table Export

The interactive table shows the statistical results (DMPs or DMRs). Column
filters let you quickly narrow hundreds of thousands of rows down to the
high-priority biological candidates. The same filters drive the heatmap, so what
you see in the table is exactly what gets visualised.

### Effect Size (Delta Beta / Mean Difference)

This is the absolute methylation difference between the groups, on the beta
scale.

- Range: `-1.0` to `+1.0`.
- Example: a value of `0.2` corresponds to a 20 percentage-point shift in
  methylation.

Filtering on effect size helps you exclude changes that are statistically
detectable but too small to be biologically relevant.

### Log Fold Change (LOG_FC)

The log2 ratio of the two group means — a complementary, ratio-based view of the
same difference.

### Significance

Use the **adjusted p-value** column to control false positives from
multiple testing, rather than the raw p-value.

## Downloading Analysis Results

All result tables can be exported as CSV files for downstream analysis,
reporting, or archiving. The export reflects the result type you are viewing
together with the active filters and sorting.

Unlike the on-screen table, which may show only a subset of rows for
performance, exported files always contain the complete dataset matching your
current criteria. Before sharing results, double-check that the active filters
and thresholds match your intended analysis.
