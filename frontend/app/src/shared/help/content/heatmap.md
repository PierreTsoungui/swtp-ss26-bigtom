## How should I read the heatmap?

The heatmap gives a visual overview of methylation across your samples and the
selected CpGs (or DMRs).

- **Rows** are CpG sites or regions; **columns** are samples.
- **Colour** encodes the beta value: low methylation at one end of the scale,
  high methylation at the other (0–1).
- **Dendrograms** (the tree branches) cluster rows and columns by similarity, so
  samples with similar profiles sit next to each other.
- The **annotation bars** on top show each sample's grouping (the primary and,
  optionally, secondary variable you chose), making it easy to see whether the
  clustering lines up with biology.

### What it tells you

Reading rows and columns together reveals which CpGs separate which groups,
whether samples cluster by biological condition (good) or by a technical factor
(a possible batch effect), and whether any sample behaves unexpectedly.

### Good to know

The heatmap uses exactly the CpGs currently selected by your table filters, up to
a fixed limit (tighten the filter if you exceed it). Treat the heatmap as a
visual companion to the statistics — interpret it together with the DMP/DMR
results rather than as standalone proof.
