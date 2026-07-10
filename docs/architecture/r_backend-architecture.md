# Architecture Specification: R Backend

**Scope:** `r_backend/` — the R analysis layer of MethylAnalyzer. This is the set of R scripts and shared utilities that perform the actual methylation computation (filtering, normalization, batch correction, differential analysis, plotting). They run inside the dedicated R worker Docker container and are invoked, one process per step, by the Python backend's R executor.

---

## Table of Contents

- [1. Purpose & Design Principles](#1-purpose--design-principles)
- [2. Directory Layout](#2-directory-layout)
- [3. Execution Model: Container & Threading Constraints](#3-execution-model-container--threading-constraints)
- [4. Invocation Convention](#4-invocation-convention)
- [5. The Progress Protocol (stdout)](#5-the-progress-protocol-stdout)
- [6. Pipeline Order & Data Flow](#6-pipeline-order--data-flow)
- [7. Job Directory Artifacts](#7-job-directory-artifacts)
- [8. Analysis Scripts](#8-analysis-scripts)
- [9. Shared Utilities (`utils/`)](#9-shared-utilities-utils)
- [10. Array-Type Handling](#10-array-type-handling)
- [11. Testing](#11-testing)
- [12. Container Image & Build](#12-container-image--build)
- [13. Extending the Pipeline](#13-extending-the-pipeline)

---

## 1. Purpose & Design Principles

The R backend converts raw Illumina methylation array data into interpretable results. It is deliberately **stateless and file-driven**: every script is a self-contained batch program that reads its inputs from a job directory, writes its outputs back into the same directory, and communicates progress on stdout. There is no long-running R service, no shared in-memory state, and no direct database access. All coordination (which step runs when, with which arguments) lives in the Python backend.

Five principles govern the code:

1. **One process per step.** Each script is launched fresh for a single job and exits when done. This keeps memory bounded and failures isolated — a crash in one step cannot corrupt another.
2. **Single source of truth for cross-cutting concerns.** Everything that must agree across scripts (the progress protocol, the execution/threading setup, sample-sheet column names, the array type, beta-matrix cleaning, dual-format plotting) lives in exactly one `utils/` module that every script sources. Scripts never re-implement these.
3. **Deterministic, single-threaded execution.** The container constrains numerical libraries to serial execution, so results are reproducible and the worker is not destabilised by nested threading (see [§3](#3-execution-model-container--threading-constraints)).
4. **Array-agnostic where possible.** Most scripts work on a plain numeric beta matrix and therefore support 450K, EPIC v1 and EPIC v2 without special-casing. Only the ChAMP-based steps (`dmp.R`, `dmr.R`) need the array type, which is detected once during filtering and persisted for them to read.
5. **Testable in isolation.** Every script defines its logic in top-level functions and runs the pipeline only under a run guard (`if (sys.nframe() == 0L)`), so a test can `source()` the file to load its functions without executing the pipeline (see [§11](#11-testing)).

---

## 2. Directory Layout

```
r_backend/
├── Dockerfile                    # R worker image: base R + Bioconductor + annotations
│
│   # ── Analysis scripts (one per pipeline step; invoked via Rscript) ──
├── init_filter.R                 # QC + probe/sample filtering from IDATs
├── normalize.R                   # apply one normalization method
├── normalization_preview.R       # density plot + PCA JSON for every method
├── batch_svd.R                   # SVD association diagnostic (batch detection)
├── batch_correct.R               # limma::removeBatchEffect correction
├── dmr.R                         # Differentially Methylated Regions (ChAMP Bumphunter)
├── dmp.R                         # Differentially Methylated Positions (ChAMP)
├── heatmap.R                     # methylation heatmap from DMP results
│
│   # ── Shared utilities (sourced by the scripts; never run directly) ──
├── utils/
│   ├── progress.R                # stdout JSON protocol: emit_progress/error/done
│   ├── runtime.R                 # single-threaded, serial, reproducible setup
│   ├── samplesheet.R             # read sheet + sample<=>matrix alignment + case/control
│   ├── arraytype.R               # detect/persist/resolve 450K·EPICv1·EPICv2 + ChAMP anno
│   ├── beta.R                    # load/clean beta matrix (clamp, drop, impute)
│   ├── stats.R                   # fast per-row variance/sd (matrixStats or base)
│   ├── columns.R                 # case-insensitive, candidate-based column access
│   ├── plotting.R                # render the same figure to PNG + PDF
│   └── heatmap_anno.R            # heatmap annotation colours (discrete/continuous)
│
└── tests/                        # testthat suites (see §11)
    ├── test_<script>.R           # one per analysis script (8 suites)
    ├── test_pipeline_integration.R  # end-to-end chain on a real IDAT fixture
    └── utils/
        └── test_<util>.R         # one per utility (9 suites)
```

Everything is mounted into the worker container at `/app/r_backend/…`, which is why every intra-project `source()` uses that absolute path (e.g. `source("/app/r_backend/utils/progress.R")`).

---

## 3. Execution Model: Container & Threading Constraints

All scripts share a single container. Uncontrolled multi-threading in BLAS/OpenMP and in Bioconductor's parallel backends causes three concrete failures in this environment: `pthread_create` errors, process crashes (core dumps) during normalization, and non-deterministic numerical output. These are avoided by constraining the entire numerical stack to a single, serial thread of execution.

### 3.1 `configure_runtime()` — the mandatory prologue

Every analysis script begins with, before any heavy library is attached:

```r
source("/app/r_backend/utils/runtime.R")
configure_runtime()
```

`configure_runtime()` (in [`utils/runtime.R`](../../r_backend/utils/runtime.R)) does four things:

| Action | Detail |
|---|---|
| Sets thread env vars to `"1"` | `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS`, `NUMEXPR_NUM_THREADS`, `VECLIB_MAXIMUM_THREADS` |
| Disables R forking | `options(mc.cores = 1L)` |
| Forces serial Bioconductor | registers `BiocParallel::SerialParam()` as default (e.g. `preprocessFunnorm` otherwise dispatches to a parallel backend) |
| Clamps threads at runtime | `RhpcBLASctl::blas_set_num_threads(1)` / `omp_set_num_threads(1)` for backends that read their thread count lazily |

It depends only on base R and treats `BiocParallel`/`RhpcBLASctl` as optional, so it is safe to call before any Bioconductor package is loaded. This ordering is required: the thread limits must take effect before a BLAS backend initialises.

### 3.2 Permitted exception: DMR bootstrap parallelism

`dmr.R` is the only script that adds parallelism above the serial baseline. Region discovery runs a bootstrap step whose iterations are independent and therefore parallelise cleanly, so `dmr.R` may spawn multiple worker processes via `doParallel`. This does not violate the single-thread rule, for the following reasons:

- each bootstrap worker is a separate R process that remains single-threaded for BLAS (the `*_NUM_THREADS=1` environment is inherited), so threads are never nested;
- the core count comes from the backend configuration value `DMR_CORES` (default `4`, passed as the `nCores` CLI argument);
- `dmr.R` caps it at the host's physical cores (`min(nCores, parallel::detectCores(logical = FALSE))`), so an over-large value has no adverse effect;
- `nCores == 1` uses `registerDoSEQ()` (fully sequential), and any failure to start the cluster falls back to sequential execution.

See `backend/app/core/config.py` (`DMR_CORES`) for the operator-tunable value and the rationale.

### 3.3 `preprocessCore` build flag

The Dockerfile installs `preprocessCore` with `--disable-threading`. Its multi-threaded quantile code crashes (core dump) inside this container; the single-threaded build is required for `QUANTILE`/`FUNNORM` normalization to run. See [§12](#12-container-image--build).

---

## 4. Invocation Convention

Scripts are **never** run by hand in production. The Python R executor builds a command of the form:

```
docker exec [<-e KEY=VAL> …] <R_WORKER_CONTAINER> Rscript <script_path> <arg1> <arg2> …
```

One `RCommand` dataclass per script (in `backend/app/services/r_executor/commands/commands.py`) owns the exact argument order. All paths are **container** paths inside the shared job directory. See [`r-executor.md`](./r-executor.md) for the engine.

### 4.1 The run guard

Every script ends with:

```r
if (sys.nframe() == 0L) {
  args <- commandArgs(trailingOnly = TRUE)
  # …arg validation…
  main(args)   # or main(args[1], args[2]) etc.
}
```
`sys.nframe() == 0L` is true whenever the file is executed at top level (e.g. via `Rscript`, but also `R -f` or `R CMD BATCH`). When a test `source()`s or `sys.source()`s the file, frames remain on the stack, the guard is skipped, and only the function definitions load. This approach is more robust than a naive `--file` match, which would also match a `test_<script>.R` file.

### 4.2 Argument shapes

There are three recurring positional shapes. Optional arguments have in-script defaults, so the backend passes only what differs from the default.

**Shape A — sample-sheet first ("filtering shape"):** `<sample_sheet_path> <job_dir> [*args]`

| Script | Full positional signature |
|---|---|
| `init_filter.R` | `<sample_sheet_path> <job_dir>` |
| `dmp.R` | `<sample_sheet> <job_dir> <beta_filename> [adjPVal] [arraytype] [group_column] [case_group] [control_group]` |
| `dmr.R` | `<sample_sheet> <job_dir> <beta_filename> [minProbes] [cutoff] [adjPvalDmr] [maxGap] [arraytype] [nBootstraps] [nCores] [group_column] [case_group] [control_group]` |

**Shape B — job-dir first:** `<job_dir> [*args]`

| Script | Full positional signature |
|---|---|
| `normalize.R` | `<job_dir> <method>` |
| `batch_correct.R` | `<job_dir> <batch_vars> [covariates]` (comma-separated column lists) |

**Shape C — explicit input file first:**

| Script | Full positional signature |
|---|---|
| `normalization_preview.R` | `<filtered_data.rds> <job_dir> <sample_sheet.csv>` |
| `batch_svd.R` | `<beta_path> <sample_sheet_path> <job_dir> [png_name]` |
| `heatmap.R` | `<result.rds> <sample_sheet.csv> <job_dir>` **+ environment variables** |

### 4.3 Environment-variable configuration (heatmap)

`heatmap.R` is the only script configured by environment variables (passed through `docker exec -e`), because its options are user-interaction parameters rather than pipeline positions:

| Variable | Default | Meaning |
|---|---|---|
| `HEATMAP_GROUP1` | `""` | Primary annotation column (auto-selected if empty) |
| `HEATMAP_GROUP2` | `""` | Optional secondary annotation column |
| `HEATMAP_MAX_ROWS` | `1000` | Hard cap on plotted CpG rows |
| `HEATMAP_OUTPUT` | `heatmap.png` | Output PNG name (PDF derived from it) |
| `HEATMAP_INPUT` | `heatmap_input.csv` | CSV of the CpG ids selected in the results table |

### 4.4 Beta-matrix handoff

`dmp.R` and `dmr.R` always read **`beta.rds`**. That file is produced in one of two ways by the backend, so the analysis scripts stay agnostic to whether batch correction ran:

- **Correction skipped:** `BetaExtractionCommand` runs an inline `getBeta(normalized_data.rds)` and saves `beta.rds`.
- **Correction applied:** `batch_correct.R` writes `corrected_data.rds` (already a beta matrix), which the backend copies to `beta.rds`.

---

## 5. The Progress Protocol (stdout)

Communication is one-way, R => backend, over **stdout**, as single-line JSON. This is implemented once in [`utils/progress.R`](../../r_backend/utils/progress.R) and used by every script. The full three-layer contract is specified in [`pipeline-progress.md`](./pipeline-progress.md); the R-side rules are:

| Emitter | Line written | Effect |
|---|---|---|
| `emit_progress(percent, message)` | `{"type":"progress","percent":<int 0-100>,"message":<str>}` | updates the job's progress bar |
| `emit_error(message)` | `{"type":"error","message":<str>}` then `quit(status = 1)` | canonical fatal path; marks the job failed |
| `emit_done(...)` | `{"type":"done", …named fields…}` | success; extra fields carry result metadata (paths, counts) |

Rules enforced by convention:

- **One JSON object per line** — never pretty-printed across lines (the backend reads line-wise, so an embedded newline would split one event).
- **stdout is the data channel;** package banners/warnings go to stderr and are treated as noise. Never emit protocol JSON on stderr.
- **Scalars are unboxed** (`auto_unbox = TRUE`) so `percent`/`message` are plain values, not length-1 arrays.
- `flush.console()` forces each line out immediately for live progress.
- `emit_error()` exits non-zero **without** R's own error trace, so the structured JSON stays the single source of truth for the failure.

Because `emit_error()` is the shared failure path, `utils/progress.R` must be sourced **before** any utility that can fail fatally (`arraytype.R`, `beta.R`, `samplesheet.R`).

---

## 6. Pipeline Order & Data Flow

The scripts form a directed acyclic graph. Each phase's output artifact is the next phase's input. `normalization_preview.R` and `batch_svd.R` are **diagnostics** — they inform a user decision but do not sit on the critical path.

```
                 IDAT files + SampleSheet.csv + filter_settings.json
                                    │
                          ┌─────────▼──────────┐
                          │   init_filter.R    │  FILTERING
                          └─────────┬──────────┘
        filtered_data.rds (RGChannelSet) │ + array_type.txt + filter_stats.json + qc_report.json
                                    │
                 ┌──────────────────┼───────────────────┐
                 │ (diagnostic)     │                   │
        ┌────────▼─────────┐        │                   │
        │normalization_    │        │                   │
        │preview.R         │        │                   │
        └────────┬─────────┘        │                   │
   density_<m>.png/.pdf,            │                   │
   pca_<m>.json  (per method)       │                   │
                          ┌─────────▼──────────┐        │
                          │    normalize.R     │  NORMALIZATION
                          └─────────┬──────────┘        │
                       normalized_data.rds              │
                                    │                   │
              ┌─────────────────────┼───────────────────┘
              │                     │
   (skip correction)        (apply correction)          SVD / BATCH
   getBeta => beta.rds       ┌──────▼───────┐   ┌───────────────────┐
              │              │batch_correct.│   │    batch_svd.R    │ (diagnostic,
              │              │R             │   │  before & after)  │  PNG+PDF)
              │              └──────┬───────┘   └───────────────────┘
              │           corrected_data.rds
              │                     │  (backend copies => beta.rds)
              └──────────┬──────────┘
                    beta.rds
                         │
                ┌────────▼─────────┐
                │     dmr.R        │  ANALYSIS (DMR first, so DMP can link regions)
                └────────┬─────────┘
             dmr_results.rds/.csv
                         │
                ┌────────▼─────────┐
                │     dmp.R        │  ANALYSIS
                └────────┬─────────┘
             dmp_results.rds/.csv (DMP rows carry DMR_ID)
                         │
                ┌────────▼─────────┐
                │    heatmap.R     │  RESULTS  (+ heatmap_input.csv = selected CpGs)
                └────────┬─────────┘
                heatmap.png / heatmap.pdf
```

Ordering notes:

- **DMR runs before DMP** so that each DMP row can be annotated with the id of the region (`DMR_ID`) it falls into.
- The **beta source** for both differential steps is `beta.rds`, which is either the extracted normalized beta or the batch-corrected matrix ([§4.4](#44-beta-matrix-handoff)).
- `init_filter.R` intentionally saves an **`RGChannelSet`** (not a probe-subset object): normalization needs the raw two-channel data to model background and dye bias. The probe-level selection is therefore carried separately in **`passed_probes.rds`** and enforced on the beta matrix inside `dmp.R` / `dmr.R` (via `utils/beta.R::restrict_to_passed_probes`), so the reported filter counts match the probes actually analysed.

---

## 7. Job Directory Artifacts

Every file lives in the single per-job directory. "Producer" is the script/step that writes it; "Consumer" the step(s) that read it.

| Artifact | Producer | Consumer(s) | Format / object |
|---|---|---|---|
| IDAT files (`*_Grn.idat`, `*_Red.idat`) | upload | `init_filter.R` | binary (two channels/sample) |
| `SampleSheet.csv` | upload | `init_filter.R`, `normalization_preview.R`, `batch_svd.R`, `dmp.R`, `dmr.R`, `heatmap.R` | Illumina `[Data]` CSV |
| `filter_settings.json` | backend (frontend config) | `init_filter.R` | JSON (absent: all filters disabled) |
| `filtered_data.rds` | `init_filter.R` | `normalize.R`, `normalization_preview.R` | `RGChannelSet` (all probes) |
| `passed_probes.rds` | `init_filter.R` | `dmp.R`, `dmr.R` | character vector of CpG ids that passed the probe-level filters |
| `array_type.txt` | `init_filter.R` | `dmp.R`, `dmr.R` | text (`450K`/`EPICv1`/`EPICv2`) |
| `filter_stats.json` | `init_filter.R` | backend => frontend | JSON (per-step counts) |
| `qc_report.json` | `init_filter.R` | frontend | JSON (beta distribution/correlation) |
| `density_<m>.png` / `.pdf` | `normalization_preview.R` | frontend | PNG (inline) + PDF (export) |
| `pca_<m>.json` | `normalization_preview.R` | frontend interactive plotter | JSON (sample, group, PC1, PC2) |
| `normalized_data.rds` | `normalize.R` | beta extraction, `batch_correct.R` | `MethylSet` (NOOB/SWAN) or `GenomicRatioSet` (QUANTILE/FUNNORM) |
| `corrected_data.rds` | `batch_correct.R` | copied => `beta.rds`; `batch_svd.R` ("after") | numeric matrix |
| `beta.rds` | beta extraction, or a copy of `corrected_data.rds` | `batch_svd.R`, `dmr.R`, `dmp.R`, `heatmap.R` (optional) | numeric matrix (probes × samples) |
| `svd_plot.png` / `.pdf` (before/after variants) | `batch_svd.R` | frontend | PNG + PDF |
| `dmr_results.csv` / `.rds` | `dmr.R` | `dmp.R` (linking), frontend | table: `ID, N_DMPS, CHR, START, STOP, WIDTH, P_VALUE, MEANDIFF` |
| `dmp_results.csv` / `.rds` | `dmp.R` | `heatmap.R`, frontend | table: `ID, CHR, POS, GENE, FEATURE, CGI, ADJ_P, GROUP1_AVG, GROUP2_AVG, DELTA_BETA, LOG_FC, DMR_ID` |
| `heatmap_input.csv` | backend (CpGs selected in the table) | `heatmap.R` | CSV (single filter source) |
| `heatmap.png` / `.pdf` | `heatmap.R` | frontend | PNG + PDF |

---

## 8. Analysis Scripts

Each script's own roxygen-style header (`@section Usage/Output/…`) is the authoritative reference; the summaries below give the architectural role, inputs, outputs and the notable behaviours.

### 8.1 `init_filter.R` — Filtering & QC

- **In:** IDAT files + sample sheet + `filter_settings.json` (absent: every filter disabled).
- **Out:** `filtered_data.rds` (`RGChannelSet`), `passed_probes.rds`, `filter_stats.json`, `qc_report.json`, `array_type.txt`.
- **Steps:** read/validate sheet => build IDAT targets => load raw `RGChannelSet` => **detect & persist array type** => sample-level QC (detection-failure rate, optional PCA outlier removal) => probe-level filters (detection p-value, bead/detection-rate, non-CpG, SNP, multi-hit, sex chromosomes) => light biological QC => persist.
- **Why an `RGChannelSet` is saved:** normalization requires the raw channel data; a probe-subset object would break it. The probe-level selection is therefore persisted as the ids in `passed_probes.rds`; `dmp.R` / `dmr.R` restrict their beta matrix to those ids, so an enabled probe filter actually removes those probes from the DMP/DMR/heatmap results (not only from the reported counts).

### 8.2 `normalize.R` — Normalization

- **In:** `filtered_data.rds` + a `method`.
- **Out:** `normalized_data.rds` (the full minfi object, so downstream keeps annotations/metadata).
- **Methods:** a registry `NORMALIZATION_METHODS` maps a method id to `function(rgset) -> object`. Supported: `noob`, `quantile`, `swan`, `funnorm`. Adding a method is one registry entry ([§13](#13-extending-the-pipeline)).
- **Array-agnostic:** minfi auto-detects the platform; no array-specific code here.

### 8.3 `normalization_preview.R` — Method comparison (diagnostic)

- **In:** `filtered_data.rds` + sample sheet.
- **Out, per method (`RAW`, `NOOB`, `QUANTILE`, `SWAN`, `FUNNORM`):** `density_<m>.png` + `.pdf` (static) and `pca_<m>.json` (PC1/PC2 points with sample + group, for the frontend's interactive plotter — NRM-03/04). `RAW` is included as an unnormalized baseline.
- Reproducibility: `SWAN` seeds its random probe subset; `FUNNORM` clamps `nPCs` below the sample count for small cohorts.

### 8.4 `batch_svd.R` — Batch-effect diagnostic

- **In:** a beta matrix + sample sheet (+ optional PNG name).
- **Out:** `<png_name>` + matching `.pdf` — a heatmap of *variables × principal components*.
- **Method:** computes PCs of the beta matrix, tests **every** sample-sheet grouping column against each PC (Kruskal–Wallis). A strong association between a *technical* variable and a major PC signals a batch effect. Works with **arbitrary** column names (no whitelist). Used before and after correction to compare effectiveness. Uses `"intersect"` sample alignment (keep samples present in both).

### 8.5 `batch_correct.R` — Batch correction

- **In:** `job_dir` + comma-separated `batch_vars` (+ optional `covariates`); reads the normalized beta.
- **Out:** `corrected_data.rds` (plain numeric matrix).
- **Method:** `limma::removeBatchEffect(x, batch, batch2, covariates, design)` preserves the effects in `design` and removes the rest. Mapping: biological covariates => `design` (preserved); 1st batch var => `batch`; 2nd => `batch2`; 3rd+ => dummy contrasts in `covariates` (all removed). Guards against a fully-confounded correction (all-`NA` output) with a clear error. Accepts arbitrary column names.

### 8.6 `dmr.R` — Differentially Methylated Regions

- **In:** sample sheet + `job_dir` + `beta.rds` (+ tuning args); array type from `array_type.txt`; the probe selection from `passed_probes.rds`.
- **Out:** `dmr_results.csv` / `.rds` (`ID, N_DMPS, CHR, START, STOP, WIDTH, P_VALUE, MEANDIFF`).
- **Method:** ChAMP's **Bumphunter** (`champ.DMR`), preceded by a fast cluster pre-check. The beta matrix is first restricted to the probes that passed the probe-level filters (`restrict_to_passed_probes`). `adjPvalDmr` is passed as `1.0` so **all** regions are returned; significance is applied later as a table filter (TAB-01). Runs before `dmp.R`. The bootstrap step is parallel (see [§3.2](#32-permitted-exception-dmr-bootstrap-parallelism)).

### 8.7 `dmp.R` — Differentially Methylated Positions

- **In:** sample sheet + `job_dir` + `beta.rds` (+ args); array type from `array_type.txt`; the probe selection from `passed_probes.rds`.
- **Out:** `dmp_results.csv` / `.rds` (schema in [§7](#7-job-directory-artifacts)).
- **Method:** ChAMP's `champ.DMP` with `adjPVal = 1` (all *tested* probes returned; significance is a downstream filter). **Delta Beta is computed deterministically** as `mean(case) - mean(control)` from the beta matrix, so its sign is well-defined regardless of ChAMP's internal contrast direction (TAB-02). Beta cleaning: load => clamp to `[0,1]` => restrict to `passed_probes.rds` => drop non-finite/invariant probes. Each DMP is linked to its region via `DMR_ID`.

### 8.8 `heatmap.R` — Result heatmap

- **In:** `result.rds` (DMP results) + sample sheet + `heatmap_input.csv` (the CpGs selected in the table, i.e. the single filter source), configured via `HEATMAP_*` env vars. The beta values are taken from `beta.rds` when present, otherwise from the group-average columns of the result table.
- **Out:** `heatmap.png` + `.pdf`.
- **Behaviour:** samples annotated by one or two grouping columns; figure auto-sized so labels, dendrograms and legends are not clipped; hard row cap (`HEATMAP_MAX_ROWS`). Array-agnostic (operates on a numeric beta matrix).

---

## 9. Shared Utilities (`utils/`)

Utilities are the project's cross-cutting contracts. They are sourced, never executed. Load order matters only in that `progress.R` (the fatal-error path) must come before any utility that can call `emit_error()`.

| Module | Responsibility | Key functions | Depends on |
|---|---|---|---|
| [`progress.R`](../../r_backend/utils/progress.R) | The stdout JSON protocol ([§5](#5-the-progress-protocol-stdout)) | `emit_progress`, `emit_error`, `emit_done` | `jsonlite` |
| [`runtime.R`](../../r_backend/utils/runtime.R) | Single-threaded, serial, reproducible setup ([§3](#3-execution-model-container--threading-constraints)) | `configure_runtime` | base R (+ optional `BiocParallel`, `RhpcBLASctl`) |
| [`samplesheet.R`](../../r_backend/utils/samplesheet.R) | Read sheet **preserving raw column names**; align samples <=> matrix; resolve case/control | `read_sample_sheet_smart`, `align_samples_to_matrix`, `resolve_case_control`, `sample_sheet_array_id` | `readr`, `progress.R` |
| [`arraytype.R`](../../r_backend/utils/arraytype.R) | Canonicalise/detect/persist array type; load the ChAMP `probe.features` annotation ([§10](#10-array-type-handling)) | `normalize_arraytype`, `champ_arraytype`, `detect_array_type`, `write_array_type`, `read_array_type`, `ensure_probe_features` | `minfi`, `progress.R` |
| [`beta.R`](../../r_backend/utils/beta.R) | Obtain & clean a numeric beta matrix (composable) | `extract_beta`, `load_beta_matrix`, `clamp_beta`, `drop_invariant_probes`, `impute_row_means` | `minfi`, `stats.R`, `progress.R` |
| [`stats.R`](../../r_backend/utils/stats.R) | Fast, **consistent** per-row variance/sd | `row_variance`, `row_sd` | base R (+ optional `matrixStats`) |
| [`columns.R`](../../r_backend/utils/columns.R) | Case-insensitive, candidate-based column access (survives `CHR`/`chr`, `gene`/`Gene`, etc. across arrays) | `pick_col`, `get_col_ci`, `has_col_ci` | base R |
| [`plotting.R`](../../r_backend/utils/plotting.R) | Render the **same** figure to PNG + vector PDF from one drawing routine | `render_png_and_pdf` | grDevices |
| [`heatmap_anno.R`](../../r_backend/utils/heatmap_anno.R) | Heatmap annotation colours; discrete vs. continuous decision | `build_colours`, `make_anno_spec` | `circlize` (attached by `heatmap.R`) |

Two utility design decisions warrant emphasis:

- **`samplesheet.R` deliberately does not use `minfi::read.metharray.sheet()` for metadata**, because that renames `Sentrix_ID => Slide` and `Sentrix_Position => Array`, which would make a batch variable the API offers (`Sentrix_Position`) invisible to the R script. The raw `[Data]` column names are the contract shared with the Python column-detection code.
- **`beta.R` splits a fatal orchestrator from pure helpers.** Only `load_beta_matrix()` emits a fatal pipeline error; `extract_beta`/`clamp_beta`/`drop_invariant_probes`/`impute_row_means` raise ordinary R errors so a caller can catch them (e.g. a per-method `tryCatch`). `stats.R` guarantees the variance is the *sample* variance (divisor n−1) on both the `matrixStats` and base-R paths, so the two never silently disagree.

- **`align_samples_to_matrix()` has three modes** for the three consumers: `"strict"` (DMP/DMR — every matrix column must map 1:1, else fatal), `"intersect"` (SVD — keep the shared samples), and `"positional"` (batch correction — full id match if possible, else assume sheet order). Ambiguous (duplicated) identifiers are always rejected.

---

## 10. Array-Type Handling

The array type (450K / EPIC v1 / EPIC v2) is the one piece of array-specific state the pipeline must carry, and [`arraytype.R`](../../r_backend/utils/arraytype.R) is its single source of truth.

- **Detection is authoritative during filtering.** minfi must know the platform to load the right manifest from the IDATs, so `init_filter.R` calls `detect_array_type()` and persists the result with `write_array_type()` to `array_type.txt`.
- **Downstream steps read, never re-detect.** `dmp.R`/`dmr.R` call `read_array_type(job_dir, fallback = <CLI arg>)`, preferring the persisted value over any CLI default. This prevents loading the wrong ChAMP annotation, which would otherwise fail (for example, EPIC v2 annotation applied to 450K data raises `object 'probe.features' not found`).
- **Canonical vs. ChAMP naming.** `normalize_arraytype()` canonicalises input (`EPIC`/`850K` => `EPICv1`). `champ_arraytype()` translates to what ChAMP expects (`EPICv1` => `"EPIC"`), because passing `"EPICv1"` hits no branch inside `champ.*`.
- **The `probe.features` fix.** `champ.DMP`/`champ.DMR` reference a global `probe.features` object they try to populate via `data()`. That load is broken for EPIC v1/v2 in this ChAMPdata build (`probe.features.epicv2` does not exist at all). `ensure_probe_features()` therefore loads (450K/EPIC v1) or **reconstructs from the minfi manifest** (EPIC v2, via `build_probe_features_minfi()`) the correct annotation and binds it in the global environment *before* ChAMP runs — exactly where ChAMP resolves the free variable.

---

## 11. Testing

Tests use **testthat** and mirror the source tree one-to-one.

```
tests/
├── test_init_filter.R            # analysis-script suites (8)
├── test_normalize.R
├── test_normalization_preview.R
├── test_batch_svd.R
├── test_batch_correct.R
├── test_dmr.R
├── test_dmp.R
├── test_heatmap.R
├── test_pipeline_integration.R   # end-to-end chain (see below)
└── utils/                        # utility suites (9)
    ├── test_progress.R
    ├── test_runtime.R
    ├── test_samplesheet.R
    ├── test_arraytype.R
    ├── test_beta.R
    ├── test_stats.R
    ├── test_columns.R
    ├── test_plotting.R
    └── test_heatmap_anno.R
```

- **One suite per source file.** Each analysis script has `test_<script>.R`; each utility has `utils/test_<util>.R`.
- **The run guard makes this possible.** Because the pipeline only runs under `if (sys.nframe() == 0L)`, a suite `source()`s the script to load its functions and tests them in isolation, without triggering a full run.
- **Subprocess for fatal paths.** `emit_error()` quits the session, so it is tested by launching a subprocess and asserting the exit code + emitted JSON (see `tests/utils/test_progress.R`).
- **`test_pipeline_integration.R` is the end-to-end chain.** It runs the **real** scripts in order on a discovered IDAT fixture — `init_filter => normalize => (beta extract) => batch_svd => dmr => dmp => heatmap` — asserting each step's exit code and artifacts *and* cross-step invariants (sample set preserved through normalization; probes flow into DMP/DMR; DMPs link to upstream DMRs). It is expensive (a full EPIC v2 run ≈ 5–8 min), so the chain runs **once** and is memoised across `test_that` blocks; it **skips cleanly** when no suitable two-group fixture is available.

The suites are executed inside the R worker container (so all Bioconductor packages and the pinned annotations are present), pointing at the same `/app/r_backend` paths the scripts use, e.g.:

```sh
docker exec <r_worker> Rscript -e "testthat::test_dir('/app/r_backend/tests')"
```

---

## 12. Container Image & Build

`r_backend/Dockerfile` builds the R worker on `rocker/r-ver:4.4.3`, pinned to **Bioconductor 3.20**. Key, intentional steps:

- **System libraries** for Bioconductor/Tidyverse native code (curl, ssl, xml2, HDF5, fonts, image codecs, …).
- **Raised download timeout** (`options(timeout = 1200)` in `Rprofile.site`) *before* any install, because the large EPIC v2 annotation package (several hundred MB) otherwise times out on slow mirrors and fails the build.
- **Single-threaded `preprocessCore`** (`--disable-threading`): the multi-threaded build crashes (core dump) during normalization in this container ([§3.3](#33-preprocesscore-build-flag)).
- **All three array annotations installed explicitly** — 450K, EPIC v1 and EPIC v2 (manifest + annotation each). minfi auto-selects one from the IDATs, so all three must be present deterministically rather than pulled in transitively.
- **ChAMP from the maintainer's GitHub** (`YuanTian1991/ChAMP` + `ChAMPdata`), which overrides the Bioconductor core after its dependencies are in place.
- **A build-time self-test** as the final layer: it loads ChAMP + minfi and asserts every one of the six annotation packages is installed, `stop()`-ing the build if any is missing. This guarantees an image can never ship without full 450K/EPIC v1/EPIC v2 support.

---

## 13. Extending the Pipeline

**Add a normalization method:** add one entry to `NORMALIZATION_METHODS` in `normalize.R` mapping the method id to `function(rgset) -> <minfi object>`. Nothing else in the script changes. Add the id to `normalization_preview.R`'s method list if it should appear in the comparison, and extend `test_normalize.R`.

**Add a new analysis step (script):**
1. Create `r_backend/<step>.R`: start with the `runtime.R` + `configure_runtime()` prologue, source the utilities you need (always `progress.R`), put logic in top-level functions, and end with the `if (sys.nframe() == 0L)` run guard that validates `commandArgs()` and calls `main()`.
2. Use `emit_progress`/`emit_error`/`emit_done` for all I/O to the backend — never `print()`/`cat()` ad-hoc protocol lines. Read inputs from, and write outputs to, the job directory only.
3. Reuse the utilities rather than re-implementing: `load_beta_matrix`/cleaning from `beta.R`, `read_sample_sheet_smart`/`align_samples_to_matrix` from `samplesheet.R`, `read_array_type` from `arraytype.R`, `render_png_and_pdf` from `plotting.R`, `pick_col` from `columns.R`.
4. Add a matching `tests/test_<step>.R`, and extend `test_pipeline_integration.R` if the step joins the critical path.
5. On the Python side, add an `RCommand` dataclass in `r_executor/commands/commands.py` that builds the argument line — do **not** edit the executor engine (see [`r-executor.md`](./r-executor.md)).

**Add a filter or QC criterion:** extend the filter configuration parsing and the `run_filtering` stage in `init_filter.R`, and surface the new count in `filter_stats.json` so the frontend can display it.
```
