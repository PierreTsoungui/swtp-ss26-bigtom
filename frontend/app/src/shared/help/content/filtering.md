## Why is filtering necessary?

Raw methylation array data always contains measurements that are technically
unreliable or biologically uninformative. Left in the dataset, they add noise,
reduce statistical power, and can lead to false conclusions.

Filtering removes low-quality probes and samples so they cannot distort the
statistical analysis (DMP/DMR) or the heatmap: filtered probes are excluded from
the results, and filtered samples are dropped before normalization. This improves
the reliability of everything downstream. Every filter below is **optional and off
by default** — enable the ones that fit your study design.

### Detection P-Value Filter

The detection p-value tests whether a probe's signal can be told apart from
background noise. A _low_ value means the measurement is trustworthy; a _high_
value means it is indistinguishable from noise. A probe is removed if its
detection p-value exceeds the cutoff in any sample.

- **Recommended cutoff:** `0.01` (allowed range `0.01`–`0.05`).
- A stricter (lower) cutoff increases confidence but removes more probes.
- A more permissive (higher) cutoff keeps more probes but admits more noise.

This is one of the most important quality-control steps in array preprocessing.

### Bead Count Filter

Each probe is measured by several beads on the array; probes backed by too few
beads (or that simply fail in many samples) give unstable readings. This filter
removes a probe when it is unreliable in **more than the chosen fraction of
samples**.

- The cutoff is a fraction between `0.0` and `1.0`.
- A lower cutoff is stricter (a probe may fail in fewer samples before it is
  dropped); a higher cutoff is more permissive.

### Non-CpG Filter

Most methylation studies focus on CpG sites, because that is where methylation
mainly regulates gene activity. Arrays also carry a small set of non-CpG probes
(measuring cytosines in other contexts), which are usually irrelevant. Removing
them trims the dataset down to the biologically meaningful CpG signal.

### SNP Filter

Some probes sit on top of a known genetic variant (a Single Nucleotide
Polymorphism, SNP). There, a signal difference can come from DNA _sequence_
differences between individuals rather than from _methylation_. This filter
removes probes affected by SNPs whose minor allele frequency (MAF) is at or above
the chosen cutoff, so the results reflect epigenetic — not genetic — variation.

- The MAF cutoff ranges from `0.0` to `0.5`; a lower cutoff removes more probes.

### Multi-Hit Filter

Multi-hit (cross-reactive) probes map to more than one location in the genome.
Their signal cannot be assigned to a single site, so it is ambiguous. Removing
them improves genomic specificity and the confidence of biological
interpretation.

### Sex Chromosome Filter

This filter removes probes on the **X** and **Y** chromosomes.

- _Recommended_ when male and female samples are analysed together and sex is not
  the question — otherwise the strong sex-linked methylation differences can
  dominate the analysis and mask disease- or treatment-related signals.
- _Not recommended_ when you are specifically studying sex differences or
  X-/Y-linked regulation.

### Sample Quality Filter

Beyond individual probes, this step judges each **sample** as a whole. A sample
with many failed probes may reflect degraded or insufficient DNA, contamination,
or a processing problem. The system computes a failure rate (the share of probes
that fail the detection p-value cutoff) and removes samples above the chosen
threshold.

- Detection p-value cutoff: `0.01`–`0.05`; sample failure rate: `5%`–`20%`.

Additionally, automated PCA-based outlier detection flags samples whose overall
methylation profile differs strongly from the rest of the cohort. Such outliers
are often technical artefacts and can distort every downstream step.
