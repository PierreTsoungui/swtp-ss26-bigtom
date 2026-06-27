## Result Filtering & Table Export

The interactive table displays statistical results. Column filters allow rapid
identification of high-priority biological candidates.

### Effect Size (Delta Beta / Mean Difference)

Represents the absolute methylation difference between experimental groups.

- **Scale:** `-1.0` to `+1.0`
- **Example:** a Delta Beta of `0.2` indicates a 20% methylation shift.

This helps exclude biologically insignificant fluctuations.

### Log Fold Change (LOG_FC)

Represents the logarithmic ratio of methylation intensities between groups.

## Downloading Analysis Results

All result tables can be exported as CSV files for downstream analysis,
reporting, or archiving. The exported dataset includes the currently selected
result type and may also preserve active filters and sorting settings.

Unlike the web interface, which may display only a subset of rows for
performance reasons, exported files always contain the complete dataset matching
the selected criteria.

> Before sharing exported results, verify that the selected filters and
> statistical thresholds match the intended analysis objectives.
