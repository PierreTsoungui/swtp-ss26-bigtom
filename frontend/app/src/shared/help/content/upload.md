## What files are required for the analysis?

To perform a DNA methylation analysis, the platform requires both the **raw
microarray data** and a corresponding **sample sheet** containing metadata about
your samples.

### Raw data (IDAT files)

The raw data must consist of Illumina IDAT files. For every biological sample,
**two files** are required:

- one *Green* channel file — `*_Grn.idat`
- one *Red* channel file — `*_Red.idat`

The system automatically scans the selected directory and all subdirectories to
identify matching file pairs.

### Sample sheet

A sample sheet must be provided in **CSV or Excel** format. It links the raw data
to biological information such as disease status, treatment groups, sex, batch
identifiers, plate information, or other experimental variables.

Because sample sheets from different databases use very different column names,
you assign **four required roles** after the sheet is read:

- **Sentrix_ID** and **Sentrix_Position** — locate the IDAT files
- **Sample_Group** — the biological grouping
- **Sample_Name** — the sample identifier

Recognized columns are pre-selected, and each column can only be used for one
role. All other columns are carried over automatically. The analysis can only
start once all four roles are assigned.

### Why this metadata matters

These variables are used throughout the workflow for:

- sample grouping
- quality assessment
- batch effect detection
- batch correction
- differential methylation analysis
- heatmap annotation and visualization

> Before the analysis starts, the system validates all uploaded files. Missing
> IDAT pairs, corrupted files, unsupported formats, or samples without
> corresponding metadata will stop the analysis to prevent invalid results.
