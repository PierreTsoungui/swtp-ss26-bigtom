# Glossary & Biology Primer

**Scope:** Cross-cutting. The biological, statistical, and technical vocabulary used across the code base, the pipeline scripts, and the rest of the documentation.

> This document is the **shared vocabulary reference** for the whole project. It combines two things: a short *biology primer* that gives a developer without a wet-lab background enough context to reason about the pipeline, and a *glossary* of the domain terms, technical abbreviations, and method codes that appear in filenames, log lines, API fields, and source code. Where a term has an authoritative home elsewhere — filter semantics in [filter-mapping.md](./contracts/filter-mapping.md), the sample-sheet columns in [samplesheet-spec.md](./contracts/samplesheet-spec.md), job states in the [API contract](./architecture/api-contract.md) — this document defines the *concept* and links out for the *contract*.

---

## 1. Purpose

The platform sits at the intersection of three vocabularies: molecular biology (methylation, CpG, hyper-/hypomethylation), bioinformatics/statistics (normalization, batch effects, DMP/DMR, FDR), and the software stack (IDAT, RDS, RFC 9457, job/phase/status). A developer reading the R scripts, the Backend routes, or the Frontend hooks will encounter all three at once. This glossary exists so that:

- a term encountered in code, a filename, or a log line can be looked up in one place;
- every other specification can link here instead of re-explaining the biology;
- reviewers and new contributors share a precise, consistent understanding of the domain.

It is a *reference*, not a tutorial: definitions are concise and neutral, and each biological concept is tied to where it surfaces in the system.

---

## 2. Scope

In scope: the biological background needed to follow the pipeline, definitions of the domain and statistical terms, the quality-control criteria applied during filtering, the normalization method codes, the batch-assessment concepts, the result metrics, and the technical abbreviations and object types used throughout the code base.

Out of scope: the exact HTTP shapes (see [api-contract.md](./architecture/api-contract.md)), the filter operator semantics and column mappings (see [filter-mapping.md](./contracts/filter-mapping.md)), the canonical sample-sheet columns (see [samplesheet-spec.md](./contracts/samplesheet-spec.md)), the on-disk artifact names (see [job-directory-layout.md](./contracts/job-directory-layout.md)), and any tutorial-level instruction on how to run an analysis.

---

## 3. Biology primer

*A minimal, technical-team-oriented briefing. Read this once; use §4 onward as a lookup table.*

### 3.1 What is measured

**DNA methylation** is an epigenetic mark: a methyl group attached to a cytosine base, most often at a **CpG site** (a cytosine immediately followed by a guanine on the same strand). It modulates gene activity *without* changing the DNA sequence, and its pattern differs between tissues, developmental stages, and disease states — which is what makes it worth measuring.

The platform quantifies methylation at hundreds of thousands of predefined CpG positions using **Illumina BeadChip arrays**. Each array probe interrogates one site and yields a fluorescence signal in two colour channels (**Red** and **Green**). The two channels together are what the scanner writes out as the raw **IDAT** files — two files per sample.

### 3.2 From raw signal to a comparable number

The end-to-end pipeline transforms raw two-channel intensities into a table of group differences, in this order:

1. **Filtering** (`init_filter.R`) — remove probes and samples whose measurements are unreliable (weak signal, too few beads, overlap with genetic variants, cross-reactive probes, sex chromosomes, per-sample quality). See §5.
2. **Normalization** (`normalize.R`, preview in `normalization_preview.R`) — reduce technical differences (dye bias, the two probe chemistries) so samples become directly comparable. See §6. Each CpG then has a **Beta-value** between 0 (unmethylated) and 1 (fully methylated).
3. **Batch assessment / correction** (`batch_svd.R`, `batch_correct.R`) — detect and optionally remove systematic technical variation that is not biology (e.g. processing date, chip). See §7. Optional.
4. **Differential analysis** (`dmp.R`, `dmr.R`) — compare the biological groups and report which single positions (**DMP**) and which multi-CpG regions (**DMR**) differ significantly, with an effect size and a corrected significance. See §8.
5. **Visualization** (`heatmap.R`) — render selected CpGs across samples.

### 3.3 The one comparison that drives everything

The **Sample Sheet** assigns each sample to a group. That grouping (canonically `Sample_Group`) defines the comparison the statistics perform. Nearly every downstream number — Delta-Beta, p-value, the heatmap annotation — is *relative to that grouping*. If the grouping is wrong, the biology is wrong, regardless of how clean the code is.

---

## 4. Input data & array technology

| Term | Definition |
|---|---|
| **IDAT file** | Illumina's raw intensity data format written by the scanner. One file per colour channel, so **two IDAT files per sample** (`_Grn.idat`, `_Red.idat`). Both are required to compute a methylation value. Consumed by `init_filter.R` as an `RGChannelSet`. |
| **Red / Green channel** | The two fluorescence colours the array records per probe. Both are needed because the two-channel signal is what encodes methylated vs. unmethylated state. |
| **Sample Sheet** | Tabular file (CSV/Excel) listing the samples and their metadata, linking each sample to its IDAT pair via the array id and recording the group assignments. Canonicalized at upload — see [samplesheet-spec.md](./contracts/samplesheet-spec.md). |
| **Array id** | `<Sentrix_ID>_<Sentrix_Position>` (e.g. `206891110001_R01C01`). The key that ties a sample-sheet row to its IDAT filenames. |
| **Sentrix_ID** | The chip/slide barcode; identifies the physical BeadChip. |
| **Sentrix_Position** | The position of a sample on the chip (e.g. `R01C01`). |
| **BeadChip / array** | The physical Illumina microarray carrying the probes. Supported types below. |
| **450K** | Illumina Infinium HumanMethylation450 array (~450,000 CpGs). |
| **EPIC v1** | Illumina Infinium MethylationEPIC v1.0 array (~850,000 CpGs). Also referred to as *EPIC* / *850K*. |
| **EPIC v2** | Illumina Infinium MethylationEPIC v2.0 array (~935,000 CpGs); the newest generation. Requires v2-specific probe annotation. |
| **Probe** | A single oligonucleotide feature on the array measuring methylation at one CpG (or, for some, a non-CpG) site. Identified by a `cg…` / `ch…` id. |
| **Bead** | A physical bead carrying copies of a probe. Several beads back each probe, giving replicate readings — see **BeadCount** (§5). |

> The canonical array-type values used in code are `450K`, `EPICv1`, `EPICv2` (`r_backend/utils/arraytype.R`). `EPIC` and `850K` are accepted aliases for EPIC v1. ChAMP internally expects the string `EPIC` for EPIC v1.

---

## 5. Core biology

| Term | Definition |
|---|---|
| **DNA methylation** | Addition of a methyl group to a cytosine (commonly forming 5-methylcytosine at CpG sites). An epigenetic modification that can influence gene expression and chromatin structure without altering the DNA sequence. |
| **CpG site** | A position where a cytosine is directly followed by a guanine on the same strand (the *p* is the phosphate linking them). The principal target of methylation in mammals. Not to be confused with a C–G base pair across the two strands. |
| **Non-CpG (CHG / CHH)** | Cytosine methylation outside the CpG context. Rare in human somatic tissue; the corresponding probes are usually filtered out (§5.1). |
| **Epigenetic** | Heritable or stable regulation of gene activity that does not change the underlying DNA sequence. |
| **Hypermethylation** | *More* methylation in the group of interest relative to the reference. At promoters, often associated with reduced gene expression. Corresponds to a positive **Delta-Beta**. |
| **Hypomethylation** | *Less* methylation relative to the reference. Can associate with increased expression or, genome-wide, with reduced genomic stability. Corresponds to a negative **Delta-Beta**. |
| **Gene / promoter** | Result rows are annotated to nearby genes (`GENE` column) so findings can be interpreted in a functional context; the `filter_gene` filter matches against this annotation. |
| **CpG island (CGI)** | A CpG-dense genomic region, often near promoters. Used as an annotation/filter category (`Island`, `Shore`, `Shelf`, `OpenSea`). |

### 5.1 Quality-control / filtering criteria

The seven criteria applied by `init_filter.R`. Each removes a well-characterised source of unreliable measurement. The Frontend exposes them as toggles; see the *Initial Filtering* step on the landing page.

| Criterion | Removes | Rationale |
|---|---|---|
| **detP (detection p-value)** | Probes/samples whose signal is not reliably above background (estimated from negative control probes). | High detection p-value ⇒ signal indistinguishable from noise. |
| **BeadCount** | Probes measured by too few beads. | Fewer replicate beads ⇒ low statistical precision. |
| **SNP** | Probes overlapping common single-nucleotide polymorphisms. | Sequence variation can distort the methylation readout and mimic a true epigenetic difference. |
| **NonCpG** | Probes measuring non-CpG (CHG/CHH) methylation. | Rare in human somatic tissue; focus is on canonical CpG methylation. |
| **MultiHit** | Cross-reactive probes matching more than one genomic location. | Ambiguous signal that cannot be attributed to a single site. |
| **XY** | Probes on the X and Y chromosomes. | Prevents sex-linked differences (e.g. X-inactivation) from dominating a comparison focused on other factors. |
| **SampleQuality** | Whole samples below an aggregate intensity/integrity threshold. | A poor sample would undermine the reliability of the entire analysis. |

---

## 6. Normalization

**Normalization** is a set of computational corrections that reduce *technical* differences between samples (dye bias between channels, the effect of the two probe chemistries, processing variation) so the remaining variation more faithfully reflects biology. It is recommended but optional.

The method codes below are the canonical strings used in `normalize.R`, `normalization_preview.R`, filenames, and the API (`method` field). See [samplesheet-spec.md](./contracts/samplesheet-spec.md) and the normalization endpoints in [api-contract.md](./architecture/api-contract.md).

| Code | Name | Summary |
|---|---|---|
| **RAW** | No normalization | The unnormalized baseline (`preprocessRaw`). Included in the *preview* for comparison; also selectable as "proceed without normalization". |
| **NOOB** | Normal-exponential out-of-band | Background correction using out-of-band signal plus dye-bias correction (`preprocessNoob`). |
| **QUANTILE** | Stratified quantile normalization | Aligns the signal-intensity distributions across samples (`preprocessQuantile`). Produces a `GenomicRatioSet`. |
| **SWAN** | Subset-quantile Within-Array Normalization | Balances the two Infinium prob0:e designs (Type I / Type II) within each array (`preprocessSWAN`). Uses a fixed random seed for reproducibility. |
| **FUNNORM** | Functional normalization | Uses control-probe signal to remove technical variation; robust when global methylation differences are expected (`preprocessFunnorm`). Produces a `GenomicRatioSet`. |

> All non-RAW methods require the raw two-channel data (an `RGChannelSet`), so normalization runs on the filtered raw object, not on an already-summarised one.

### 6.1 Diagnostic plots

| Term | Definition |
|---|---|
| **Density plot** | Distribution of Beta-values across all probes, per sample; typically a two-peak (bimodal) curve for unmethylated vs. methylated states. Used to judge quality and whether normalization made samples more comparable. Rendered as PNG. |
| **PCA plot (preview)** | Interactive scatter (rendered from JSON) summarising each sample's profile into a few components, to see whether samples cluster by biology or by a technical factor after each method. |

---

## 7. Batch effects & dimensionality

| Term | Definition |
|---|---|
| **Batch effect** | Systematic *technical* variation from samples processed in different groups, on different days, arrays, or by different operators. Most problematic when **confounded** with the biological grouping, because it can then be mistaken for a real difference. |
| **Confounding** | When a technical variable aligns with the biological grouping, making their effects indistinguishable. The core risk a batch assessment tries to detect. |
| **Batch column** | A sample-sheet column representing a technical grouping whose effect is *removed* during correction. Chosen at request time (permissive — any grouping column is eligible). See [samplesheet-spec.md](./contracts/samplesheet-spec.md) §3.4. |
| **Covariate column** | A biological grouping whose signal is *preserved* during correction (protected from removal). |
| **PCA (Principal Component Analysis)** | Reduces the many per-sample measurements to a few components capturing the largest sources of variation; each sample is a point, similar profiles cluster together. |
| **SVD (Singular Value Decomposition)** | The matrix factorization underlying PCA. Here it decomposes the data into components and relates them to sample characteristics, revealing whether variation is driven by biology or by technical batch. Produced by `batch_svd.R` as a JSON heatmap; generated **before and after** correction to judge the effect. |
| **Principal component (PC)** | One axis of variation from PCA/SVD, ordered by the fraction of total variance it explains. |
| **Batch correction** | Removal of the batch effect while protecting the biological grouping. Implemented iteratively via `limma::removeBatchEffect` (`batch_correct.R`); can be applied in successive rounds, each recorded in the batch history. |

---

## 8. Differential analysis & result metrics

| Term | Definition |
|---|---|
| **Beta-value (β)** | Methylation at a single CpG: methylated signal ÷ total signal, in **[0, 1]** (0 = unmethylated, 1 = fully methylated). The primary reporting scale. |
| **M-value** | The logit transform of the Beta-value (log2 of methylated/unmethylated). More statistically well-behaved for some tests; Beta is used for reporting because it is interpretable. |
| **DMP (Differentially Methylated Position)** | A *single* CpG site whose methylation differs significantly between the compared groups. The finest-grained result. Produced by `dmp.R` → `dmp_results.csv`. |
| **DMR (Differentially Methylated Region)** | A *contiguous region* of several neighbouring CpGs showing a consistent, significant difference. Often more robust and interpretable than isolated positions. Produced by `dmr.R` via the ChAMP **Bumphunter** method → `dmr_results.csv`. |
| **Delta-Beta (Δβ)** | Difference between the two groups' mean Beta-values at a site. Encodes both **effect size** (magnitude) and **direction** (sign: which group is higher). Column `DELTA_BETA`; filtered via `abs_gte` / `direction`. |
| **logFC (log fold change)** | The effect size on the M-value (log) scale, as reported by the limma model. |
| **mean diff** | The DMR analogue of Delta-Beta: the mean methylation difference across the region. |
| **p-value** | Probability of observing a difference at least this large if there were truly none. Smaller ⇒ stronger evidence. |
| **Adjusted p-value / FDR** | A p-value corrected for testing many CpGs simultaneously. Controlling the **False Discovery Rate (FDR)** limits the expected proportion of false positives among reported hits. Prefer this over the raw p-value for thresholding. |
| **Bumphunter** | The region-finding algorithm (via ChAMP's `champ.DMR`) that groups nearby CpGs into candidate DMRs and tests them. |
| **Heatmap** | A matrix visualization of selected CpGs (rows) across samples (columns), annotated by chosen sample-sheet groups, with optional dendrogram clustering. Produced by `heatmap.R` (PNG + PDF). Uses the **same filter source** as the DMP table — see [filter-mapping.md](./contracts/filter-mapping.md). |

---

## 9. Technical terms & abbreviations

Software-stack and pipeline vocabulary that a developer meets in code, filenames, logs, and API fields.

| Term | Definition |
|---|---|
| **RGChannelSet** | The minfi R object holding the raw Red/Green intensities loaded from IDAT files. The input to filtering and normalization. |
| **MethylSet** | A minfi object of methylated/unmethylated signals (produced by NOOB/SWAN). |
| **GenomicRatioSet** | A minfi object of genome-mapped Beta/M-values (produced by QUANTILE/FUNNORM). |
| **RDS** | R's single-object serialization format (`.rds`). The pipeline passes intermediate objects between stages as RDS files on the shared job volume — see [job-directory-layout.md](./contracts/job-directory-layout.md). |
| **minfi** | The Bioconductor package for reading and processing Illumina methylation arrays (IDAT loading, normalization, detection p-values). |
| **ChAMP** | The Bioconductor analysis pipeline package; here the source of the DMR (`champ.DMR` / Bumphunter) step. |
| **limma** | The Bioconductor linear-models package; used for the DMP model and for `removeBatchEffect` in batch correction. |
| **Bioconductor** | The R ecosystem of bioinformatics packages that minfi, ChAMP, and limma belong to. |
| **Progress contract** | The three-layer convention by which each R script reports progress to the Backend and Frontend via JSON lines on stdout (`emit_progress`, `emit_error`). Defined in [pipeline-progress.md](./architecture/pipeline-progress.md). |
| **emit_progress / emit_error** | The R helper functions (`utils/progress.R`) that write the progress/error JSON events the Backend parses. |
| **Job** | One end-to-end analysis, identified by a `job_id` (UUID). Its files live under `jobs/<job_id>/`. |
| **job_id** | The UUID identifying a job and its directory. |
| **status** | The global job state. Values: `waiting`, `running`, `completed`, `failed`. Authoritative list in [api-contract.md](./architecture/api-contract.md). |
| **phase** | The current technical pipeline stage. Values: `uploaded`, `filtering`, `normalization_preview`, `normalization`, `svd`, `batch`, `analysis`, `results`, `heatmap`. |
| **Staging** | The pre-job holding area (`staging/<session_id>/`) used during the two-phase upload before a job is committed. See [job-directory-layout.md](./contracts/job-directory-layout.md). |
| **Two-phase upload** | *Inspect* (stage + classify + map columns) then *commit* (create the job). Nothing enters `jobs/` until commit. |
| **RFC 9457** | The IETF "Problem Details for HTTP APIs" standard (`application/problem+json`) used for all error responses. See [api-contract.md](./architecture/api-contract.md). |
| **Polling** | The Frontend model of repeatedly calling `GET /status/{job_id}` to track progress, stopping at terminal states. |
| **r_worker** | The R container in which pipeline scripts run, invoked by the Backend via `docker exec`. See [r-executor.md](./architecture/r-executor.md). |
| **DMR_CORES** | Environment variable capping the parallel worker count for the memory-heavy DMR step. |

---

## 10. Method & code abbreviations (quick reference)

| Abbrev. | Expansion | Section |
|---|---|---|
| CpG | Cytosine–phosphate–Guanine site | §5 |
| detP | Detection p-value | §5.1 |
| SNP | Single Nucleotide Polymorphism | §5.1 |
| XY | X/Y (sex) chromosome probes | §5.1 |
| RAW / NOOB / QUANTILE / SWAN / FUNNORM | Normalization methods | §6 |
| PCA | Principal Component Analysis | §7 |
| SVD | Singular Value Decomposition | §7 |
| PC | Principal Component | §7 |
| β / Δβ | Beta-value / Delta-Beta | §8 |
| DMP | Differentially Methylated Position | §8 |
| DMR | Differentially Methylated Region | §8 |
| logFC | log Fold Change | §8 |
| FDR | False Discovery Rate | §8 |
| CGI | CpG Island | §5 |
| 450K / EPICv1 / EPICv2 | Illumina array types | §4 |
| IDAT | Intensity Data (Illumina raw format) | §4 |
| RDS | R Data Serialization | §9 |
| RFC 9457 | HTTP Problem Details standard | §9 |

---

## 11. Extension Points

How to keep this glossary correct as the system grows. A term belongs here when it appears in **more than one** layer (code, filename, API field, another doc) and a newcomer could not infer it from context.

- **New biological/statistical concept** (e.g. a new result metric): add a row to the relevant section (§5–§8) and, if it is an abbreviation, to the quick-reference table (§10). Link out to the contract that owns its behaviour rather than restating it here.
- **New normalization method:** add its canonical code and one-line summary to §6, matching the string used in `normalize.R`/`normalization_preview.R` and the API `method` field. Cross-reference the extension playbook for adding a method.
- **New quality-control criterion:** add a row to §5.1 with what it removes and why.
- **New filter or column:** do **not** describe filter semantics here — define the *concept* only, and link to [filter-mapping.md](./contracts/filter-mapping.md) / [samplesheet-spec.md](./contracts/samplesheet-spec.md), which own the contract.
- **New `status`/`phase` value or technical term:** update §9 and keep the value lists in sync with the authoritative [api-contract.md](./architecture/api-contract.md); do not let this document become a second source of truth for enums — link to it.
- **Consistency rule:** definitions here must not contradict the source specs. When they would, fix the source spec and link to it, not duplicate it.
