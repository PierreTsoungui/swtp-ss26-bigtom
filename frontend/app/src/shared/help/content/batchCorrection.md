## What are batch effects?

Batch effects are systematic, non-biological differences introduced while the
data is generated. Common sources include:

- processing date or technician
- array (chip) or plate
- scanner or reagent lot

If they are not addressed, batch effects can hide real biological findings or
create false positives — samples may cluster by _when/where_ they were processed
instead of by their biology.

## Interpreting the SVD Heatmap

The SVD heatmap summarises where the variation in your data comes from. It
decomposes the methylation matrix into **principal components** (the main axes of
variation) and tests each metadata variable against each component, showing the
**association p-value** in every cell (darker = stronger association).

- A strong association between a **technical** variable (e.g. _chip_, _plate_)
  and a major component is a red flag for a batch effect.
- Your **biological** variable of interest should explain a meaningful share of
  the variation — that is the signal you want to keep.

## When and how to apply correction

Apply batch correction only when the SVD heatmap shows real evidence of a
technical effect. In the form you select:

- the **batch variable** — the technical factor to remove, and
- the **covariates** — your biological variable(s) to protect, so the correction
  does not strip out the signal you care about.

Correction is then performed with `limma::removeBatchEffect`. You can run it
**iteratively**: after each round a new SVD heatmap is produced, so you can check
that the technical association has faded while the biological one remains. Avoid
correcting unnecessarily — every correction also risks removing real signal, so
base the decision on the PCA/SVD evidence rather than applying it by default.
