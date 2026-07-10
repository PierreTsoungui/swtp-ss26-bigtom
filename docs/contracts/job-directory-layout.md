# Contract: Job Directory Layout

**Purpose:** Define the on-disk file contract for a job — every artifact under `jobs/<job_id>/`, who produces it, and who consumes it.
**Scope:** The `jobs/<job_id>/` directory and its relationship to the `staging/<session_id>/` directory. The file-level integration surface between the Backend and the R backend.

> This document is the **canonical source of truth** for job artifacts. It defines *what* files exist and *who owns them*, not *how* the pipeline computes them. Pipeline sequencing and execution belong to [backend-architecture.md](../architecture/backend-architecture.md) and [pipeline-progress.md](../architecture/pipeline-progress.md); the per-script inputs/outputs belong to the [R scripts reference](../architecture/r_backend-architecture.md).

---

## 1. Purpose

The Backend and the R backend do not share memory. They exchange data almost exclusively through files in a per-job directory on a shared volume. That directory is therefore a **contract**: each side must write the agreed filenames in the agreed place, and read only what the other side has promised to produce.

This document fixes that contract so that:

- a Backend route knows exactly which file to serve for a given endpoint;
- an R script knows exactly which inputs exist and which outputs it must write;
- a reviewer can verify that a change does not break the file-level integration.

---

## 2. Scope

In scope: the directory `jobs/<job_id>/`, every artifact it may contain, the producer/consumer of each, naming conventions, persistence guarantees, and the staging directory that feeds it.

Out of scope: the internal logic of the pipeline, the HTTP request/response shapes (see [api-contract.md](../api/api-contract.md)), the sample-sheet format (see [samplesheet-spec.md](./samplesheet-spec.md)), and the meaning of the result-table columns (see [filter-mapping.md](./filter-mapping.md)).

---

## 3. Concepts / Contract

### 3.1 Producer / consumer model

Every artifact has exactly one **producer** — the component responsible for writing it — and one or more **consumers** that read it. Two producers appear in this contract:

- **Backend** — the Python application (routes and services).
- **R** — a specific R script executed in the R worker container (named in the tables below).

Consumers are either the **Backend** (a route serving the file to the Frontend, or a service reading it as pipeline input) or a **downstream R script** (which reads an earlier stage's output).

No component may write another producer's artifact. This single-writer rule is what makes the directory safe to share without locking.

### 3.2 Persistence guarantees

- **Job directories are durable.** Files persist on the shared volume until the job is deleted, either explicitly (a reset — see [api-contract.md](../api/api-contract.md) §9) or automatically by the retention cleanup (see [security.md](../backend/security.md)).
- **In-memory job state is ephemeral.** The `(phase, status)` of a job lives in the Backend process, not in the directory, and is lost on restart. The files survive a restart; the live session does not (see [job-lifecycle.md](../architecture/job-lifecycle.md)).
- **Artifacts are append-only within a run.** A stage writes its outputs once; later stages add new files rather than mutating earlier ones. The batch loop is the only iterative case and it writes **new, indexed** files per round (§4.3).
- **JSON artifacts the Backend owns are written atomically** (temporary file + atomic rename), so a reader never observes a half-written file.

### 3.3 Relationship to the staging directory

Uploads are assembled in a **staging session** before they become a job. The staging directory `staging/<session_id>/` is a sibling of `jobs/` on the same filesystem, which lets the commit step move the confirmed files into the job directory atomically. Staging is short-lived and is never read by the pipeline; only a successful commit promotes files into `jobs/<job_id>/`. See §5.

---

## 4. Reference

### 4.1 Directory tree

A fully populated job directory (after a complete run with one batch-correction round and a heatmap):

```text
jobs/<job_id>/
├── SampleSheet.csv            # canonical sample sheet (see samplesheet-spec.md)
├── <sample>_Grn.idat          # raw IDAT files (one Grn/Red pair per sample)
├── <sample>_Red.idat
├── filter_settings.json       # filter configuration chosen at upload
├── array_type.txt             # detected array platform (450K / EPICv1 / EPICv2)
├── filter_stats.json          # filtering summary (per-step probe-removal counts)
├── qc_report.json             # beta-distribution / correlation QC summary
├── filtered_data.rds          # filtered probe matrix (RGChannelSet)
├── density_<method>.png       # normalization-preview density plot (per method)
├── density_<method>.pdf       # same, vector format
├── pca_<method>.json          # normalization-preview PCA points (per method)
├── preview_plots.json         # preview manifest (index of the artifacts above)
├── normalized_data.rds        # normalized data (chosen method)
├── svd_plot_0.png             # SVD diagnostic, round 0 (baseline)
├── svd_plot_0.pdf             # same, vector format
├── corrected_data.rds         # batch-corrected data (only if correction was run)
├── svd_plot_1.png             # SVD diagnostic, round 1 …
├── svd_plot_1.pdf             # same, vector format
├── batch_history.json         # batch-correction round history
├── beta.rds                   # beta matrix handed to differential analysis
├── dmp_results.rds            # DMP results (R-native)
├── dmp_results.csv            # DMP results (tabular, served to the Frontend)
├── dmr_results.rds            # DMR results (R-native)
├── dmr_results.csv            # DMR results (tabular, served to the Frontend)
├── heatmap_input.csv          # CpG IDs selected for the heatmap
├── heatmap.png                # rendered heatmap (raster)
└── heatmap.pdf                # rendered heatmap (vector, for export)
```

Not every job contains every file: artifacts appear as their producing stage runs, and stages such as batch correction or heatmap are optional.

### 4.2 Artifact reference

| Artifact | Stage | Producer | Consumer(s) | Purpose |
|---|---|---|---|---|
| `SampleSheet.csv` | Upload | Backend | R (all scripts), Backend (batch/heatmap options) | Canonical sample sheet. Format: [samplesheet-spec.md](./samplesheet-spec.md). |
| `<sample>_Grn.idat`, `<sample>_Red.idat` | Upload | Backend | R (`init_filter.R`) | Raw intensity data; one Grn/Red pair per sample. |
| `filter_settings.json` | Upload | Backend | R (`init_filter.R`) | The filter configuration selected by the user. |
| `array_type.txt` | Filtering | R (`init_filter.R`) | R (`normalize.R`, `normalization_preview.R`, `batch_svd.R`, `batch_correct.R`, `dmp.R`, `dmr.R`) | Detected Illumina array platform (`450K`, `EPICv1`, or `EPICv2`). Written once by minfi detection; read by every downstream R step to load the matching probe annotation and pass the correct `arraytype` argument to ChAMP. Absent files fall back to a configurable default. |
| `filter_stats.json` | Filtering | R (`init_filter.R`) | Backend (`GET /filter/{id}/stats`) | Per-filter probe-removal summary. |
| `qc_report.json` | Filtering | R (`init_filter.R`) | — (internal diagnostic; not currently exposed via any API route) | Beta-distribution and inter-sample correlation summary produced during QC. Available on disk for offline inspection; not served to the Frontend. |
| `filtered_data.rds` | Filtering | R (`init_filter.R`) | R (`normalize.R`, `normalization_preview.R`) | Filtered probe matrix (`RGChannelSet`). |
| `density_<method>.png` | Normalization preview | R (`normalization_preview.R`) | Backend (`GET /preview/.../{plot_name}`) | Density plot per normalization method (raster). |
| `density_<method>.pdf` | Normalization preview | R (`normalization_preview.R`) | Backend (`GET /preview/.../{plot_name}`) | Same density plot in vector format; served when the client requests the `.pdf` variant. |
| `pca_<method>.json` | Normalization preview | R (`normalization_preview.R`) | Backend (`GET /preview/normalization/{id}`) | PCA points per method; inlined into the preview response. |
| `preview_plots.json` | Normalization preview | Backend | Backend (`GET /preview/normalization/{id}`) | Manifest indexing the density/PCA artifacts per method. |
| `normalized_data.rds` | Normalization | R (`normalize.R`) | R (`batch_svd.R`, `batch_correct.R`); Backend (beta extraction) | Normalized data for the chosen method. |
| `svd_plot_<round>.png` | SVD | R (`batch_svd.R`) | Backend (`GET /batch/{id}/svd-plot/{round}`) | SVD diagnostic plot per round (round 0 = baseline, round N = after N-th correction). Raster format. |
| `svd_plot_<round>.pdf` | SVD | R (`batch_svd.R`) | Backend (`GET /batch/{id}/svd-plot/{round}?format=pdf`) | Same SVD diagnostic in vector format; served when the client requests `format=pdf`. |
| `corrected_data.rds` | Batch correction | R (`batch_correct.R`) | Backend (beta extraction); R (`batch_svd.R`) | Batch-corrected data. Present only if at least one correction round ran. |
| `batch_history.json` | Batch correction | Backend | Backend (`GET /batch/{id}/history`) | History of correction rounds and their settings. |
| `beta.rds` | Analysis | Backend (inline R) | R (`dmp.R`, `dmr.R`) | Beta matrix for differential analysis. Produced by the Backend via an inline R command (`getBeta(normalized)`) executed in the R worker container. Source is `corrected_data.rds` if a correction round ran, otherwise `normalized_data.rds`. |
| `dmp_results.rds` / `.csv` | Analysis | R (`dmp.R`) | Backend (`GET /table/.../dmp`, heatmap selection); R (`heatmap.R`) | Differentially methylated positions. Columns: [filter-mapping.md](./filter-mapping.md). |
| `dmr_results.rds` / `.csv` | Analysis | R (`dmr.R`) | Backend (`GET /table/.../dmr`) | Differentially methylated regions. Columns: [filter-mapping.md](./filter-mapping.md). |
| `heatmap_input.csv` | Heatmap | Backend | R (`heatmap.R`) | The CpG IDs selected by the shared filter layer for the heatmap. |
| `heatmap.png` / `heatmap.pdf` | Heatmap | R (`heatmap.R`) | Backend (`GET /heatmap/{id}`) | Rendered heatmap (raster and vector). |

The R-native `.rds` files are intermediate compute state consumed only by later R stages; the `.csv` variants are the tabular contract exposed to the Frontend.

### 4.3 Naming conventions

- **SVD plots are indexed by round:** `svd_plot_<round>.{png,pdf}`, where round `0` is the baseline SVD produced after normalization and round `N` (N ≥ 1) is the state after the N-th correction. Both raster (`.png`) and vector (`.pdf`) variants are always written.
- **Preview artifacts are keyed by method:** `density_<method>.{png,pdf}` and `pca_<method>.json`, where `<method>` is one of the supported normalization methods (`raw`, `noob`, `quantile`, `swan`, `funnorm`). Both raster and vector density plots are always written; PCA data is JSON only.
- **Result tables use fixed names:** `dmp_results.{rds,csv}` and `dmr_results.{rds,csv}`.
- **Terminal artifacts use fixed names:** `heatmap.{png,pdf}`.
- **Pipeline-internal artifacts use fixed names:** `array_type.txt`, `qc_report.json`.

Endpoints that serve a named file validate the requested name against these conventions before touching the filesystem (see [security.md](../backend/security.md)).

### 4.4 Staging directory

```text
staging/<session_id>/
├── _manifest.json             # internal classification of the staged upload
└── <uploaded files…>          # raw files as received (folder contents / unpacked ZIP)
```

| Property | `jobs/<job_id>/` | `staging/<session_id>/` |
|---|---|---|
| Created by | Commit (Backend) | Inspect (Backend) |
| Identified by | `job_id` (UUID) | `session_id` (UUID) |
| Read by the pipeline | Yes | No |
| Retention | Long (job retention window) | Short (staging retention window) |
| Purpose | The authoritative job data | Unconfirmed upload awaiting commit |

`_manifest.json` is an internal Backend artifact; its shape is an implementation detail and is not part of the external contract. The classified result exposed to the Frontend is the `InspectManifest` response documented in [api-contract.md](../api/api-contract.md) §1.

---

## 5. Error Cases / Edge Cases

- **Missing expected artifact.** If a consumer cannot find a required file, it fails with the corresponding API error rather than proceeding — e.g. requesting filter stats before filtering has produced `filter_stats.json` returns `409 filtering-not-finished`; requesting a heatmap before differential analysis has produced `dmp_results.csv` returns `404 file-not-found`. See [api-contract.md](../api/api-contract.md).
- **Partial run.** A job directory reflects only the stages that have completed. The absence of later artifacts is normal, not an error.
- **Concurrent deletion.** The retention cleanup may remove an expired directory at any time. Backend file walks tolerate a file disappearing mid-operation and never crash on it.
- **Corrupt Backend-owned JSON.** A damaged `batch_history.json` is treated as "no history" and rebuilt, rather than surfacing a 500; this is possible because the Backend is its sole writer.
- **Path safety.** `job_id`/`session_id` and any client-supplied filename are validated so that no request can escape the job directory. The guarantees are specified in [security.md](../backend/security.md).

---

## 6. Extension Points

To add a new artifact:

1. Choose a fixed, descriptive filename that follows §4.3 and does not collide with an existing name.
2. Assign exactly one producer and record it, with its consumers, in the §4.2 table.
3. If an R script is the producer, document its output in the [R scripts reference](../architecture/r_backend-architecture.md); if the Backend serves it, document the endpoint in [api-contract.md](../api/api-contract.md).
4. Preserve the single-writer rule and the persistence guarantees (§3.2).

A new artifact is part of the contract only once it appears in this document.