## What files are required for the analysis?

To run a DNA methylation analysis, the platform needs two things: the **raw
microarray signal** and a **sample sheet** that describes your samples.

### Raw data (IDAT files)

The raw data must consist of Illumina IDAT files. Illumina arrays measure each
sample on two channels, so **every sample is represented by two IDAT files**:

- a _Green_ channel file — ends in `_Grn.idat`
- a _Red_ channel file — ends in `_Red.idat`

Both files of a pair share the same prefix (the Sentrix barcode and position,
e.g. `203927450093_R01C01`). You can drop a folder or a `.zip`; the system scans
all subfolders and pairs the Red/Green files automatically. EPIC (v1/v2) and
450K arrays are supported.

### Sample sheet

A sample sheet must be provided as **CSV or Excel**. It connects each IDAT pair
to its biological metadata, such as disease status, treatment group, sex, age,
processing batch, or plate.

Because sample sheets from different sources use different column names, you map
your columns to **four required roles** after the sheet is read:

- **Sentrix_ID** and **Sentrix_Position** — together they identify which IDAT
  pair belongs to each row.
- **Sample_Name** — a human-readable label shown in plots and tables.
- **Sample_Group** — the main biological grouping (e.g. _tumor_ vs. _normal_).

Columns that the system recognises are pre-selected, and each column can be used
for only one role. **All remaining columns are kept** and stay available later
for quality assessment, batch-effect detection, batch correction, and heatmap
annotation. The analysis can start only once all four roles are assigned.

### Validation before the run

Before anything is processed, the system checks the upload: incomplete IDAT
pairs, unreadable or corrupted files, unsupported formats, and samples that have
no matching metadata (or metadata with no matching files) are reported and stop
the run, so problems surface early instead of producing misleading results.
