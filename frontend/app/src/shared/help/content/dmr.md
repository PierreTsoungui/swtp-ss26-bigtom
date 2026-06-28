## DMR Analysis

**Differentially Methylated Regions (DMRs)** are stretches of the genome where
several neighbouring CpGs change methylation together. Regions are discovered
with a clustering approach (Bumphunter) that groups nearby CpGs and tests them
jointly.

### Why regions matter

Compared with single DMPs, DMRs usually carry **stronger biological evidence**:
gene regulation typically acts over groups of CpGs (promoters, CpG islands,
enhancers) rather than at one isolated position, so a coordinated regional change
is less likely to be a chance finding.

### What the analysis reports

For each region the analysis reports the genomic coordinates, region size (width
in base pairs), the number of CpGs it contains, the mean methylation difference
between groups, and a significance statistic.

As with DMPs, all discovered regions are returned and you refine them with the
table filters (e.g. by p-value, width, number of CpGs, or effect size).
