## What are batch effects?

Batch effects are systematic technical differences that arise independently of
biology. Common sources include:

- processing dates
- laboratory personnel
- array batches
- sample plates
- scanner runs

If left uncorrected, batch effects can obscure genuine biological findings or
create false-positive results.

## Interpreting the SVD Heatmap

The SVD heatmap displays associations between metadata variables and principal
components. Each cell contains a statistical significance value indicating how
strongly a variable contributes to variation in the dataset.

- Strong associations between **technical** variables and major principal
  components often indicate the presence of batch effects.
- The **biological** variable of interest should generally explain a substantial
  proportion of the observed variation.

## When should batch correction be applied?

Batch correction should only be performed when **evidence for technical batch
effects exists**. The platform protects the selected biological variable from
being removed during correction.

> Applying batch correction unnecessarily may reduce or eliminate genuine
> biological signals. Always base the decision on evidence from PCA and SVD
> analyses rather than performing it automatically.
