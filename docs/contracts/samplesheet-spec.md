# Contract: Sample Sheet Specification

**Purpose:** Define the canonical internal sample-sheet format, its columns and roles, and the guarantees the upload step provides when normalizing arbitrary uploads into that format.
**Scope:** The canonical `SampleSheet.csv`, the accepted input variations, the role mapping applied at upload, and the resulting normalization guarantees. The contract between the user's upload and every downstream consumer.

> This document is the **canonical source of truth** for the sample sheet. It describes the *contract*, not the parser. Where the canonical sheet is stored is defined in [job-directory-layout.md](./job-directory-layout.md); which of its columns become filterable/annotation metadata is defined in [filter-mapping.md](./filter-mapping.md); the upload endpoints and the mapping UI payloads are defined in [api-contract.md](../api/api-contract.md).

---

## 1. Purpose

Customers provide sample sheets in whatever form their Illumina or Excel tooling produced — different containers, delimiters, header layouts, and column names. Every downstream consumer (the R scripts, and the Backend's batch/heatmap/preview logic), however, needs **exactly one shape**.

The system resolves this by converting **once, at upload time**, into a single canonical CSV. This document defines that canonical format and the guarantees the conversion makes, so that:

- every consumer can rely on a fixed set of column names;
- the upload layer knows precisely what it must produce and reject;
- a reviewer can reason about compatibility without reading the parser.

---

## 2. Scope

In scope: the canonical CSV format, the required and optional columns, the semantic roles, the user-driven column mapping performed at upload, the accepted input variations, the normalization guarantees, and the validation/error conditions.

Out of scope: the conversion algorithm (an implementation detail), the on-disk location of the stored sheet (see [job-directory-layout.md](./job-directory-layout.md)), the biological background of the columns (see the [glossary](../glossary.md)), and the HTTP shapes of the upload/mapping endpoints (see [api-contract.md](../api/api-contract.md)).

---

## 3. Concepts / Contract

### 3.1 Canonicalization guarantee

Every upload — regardless of container, delimiter, header layout, or column naming — is converted into **one canonical `SampleSheet.csv`** before a job begins. Downstream components never parse a raw upload; they read only the canonical sheet. This is a hard guarantee: if canonicalization cannot produce a valid canonical sheet, the upload is rejected and no job is created.

### 3.2 Canonical CSV format

The canonical sheet is a UTF-8, comma-separated CSV with an Illumina-style structure:

```text
[Data]
Sample_Name,Sample_Group,Sentrix_ID,Sentrix_Position
HeLa,Cellline,206891110001,R01C01
Jurkat,Cellline,206891110002,R02C01
```

- A `[Data]` marker line precedes the column header row. Consumers locate the header by this marker.
- The header row uses the **canonical column names** defined in §4.1.
- Each subsequent line is one sample.
- Column order is not significant; consumers address columns by name.

### 3.3 Canonical roles and the Basename guarantee

The contract fixes four **canonical roles** — the columns every consumer reads by name:

| Role | Canonical name | Meaning |
|---|---|---|
| Chip barcode | `Sentrix_ID` | Identifies the physical chip/slide; combined with the position, locates the sample's IDAT pair. |
| Chip position | `Sentrix_Position` | Position on the chip (e.g. `R01C01`). |
| Sample identity | `Sample_Name` | Human-readable identifier for a sample. |
| Biological group | `Sample_Group` | The biological grouping used as the default source for comparison, batch, and covariate selection. |

In addition to the four role columns, the canonical sheet always carries a fifth guaranteed column:

| Column | Meaning |
|---|---|
| `Basename` | IDAT file-name prefix used to locate the raw data. Always present in the canonical output — either taken verbatim from the user's sheet or synthesized from `<Sentrix_ID>_<Sentrix_Position>`. See §3.6. |

`Sentrix_ID` and `Sentrix_Position` together form the **array id** (`<Sentrix_ID>_<Sentrix_Position>`, e.g. `206891110001_R01C01`). The `Basename` column is the single, authoritative linkage key used by all R consumers to locate a sample's IDAT pair and to name per-sample data columns throughout the pipeline.

### 3.4 Runtime column roles (batch, covariate, comparison group)

Beyond the four structural roles, the analysis uses **runtime role selections** the user makes over the sample sheet's columns:

- a **batch column** — a technical grouping whose effect is removed during batch correction;
- **covariate columns** — biological groupings whose signal is preserved during correction;
- a **comparison group column** with a **case** and **control** value — defines the DMP/DMR contrast;
- **annotation columns** — used to group/colour the heatmap.

These are **not fixed columns**. They are chosen at request time from the sample sheet's columns, and the system is deliberately permissive: any column that groups the samples is eligible (the biologist decides which is technical and which is biological). The eligibility rules and the endpoints that expose these choices are defined in [api-contract.md](../api/api-contract.md) (§6 Batch, §8 Heatmap); this document only guarantees that the columns exist in the canonical sheet.

### 3.5 User mapping vs. alias detection

Two paths produce the canonical column names:

- **Explicit user mapping (primary).** During the two-phase upload the user maps the four canonical roles to the raw columns of the chosen sheet via dropdowns. The user is authoritative: exactly those columns are renamed to the canonical role names, and all other columns are passed through unchanged. Pre-filled suggestions are offered where a confident alias match exists, but the user confirms them.
- **Alias auto-detection (fallback).** When no explicit mapping is provided (the deprecated single-shot upload, or an already-canonical sheet), known Illumina aliases (§4.2) are mapped automatically.

### 3.6 IDAT linkage and `Basename` synthesis

A sample-sheet row is tied to its IDAT pair through a **file prefix**; the files are `<prefix>_Grn.idat` and `<prefix>_Red.idat`. Two input conventions are recognised:

| Input convention | Prefix origin | When it applies |
|---|---|---|
| Array id (default) | `<Sentrix_ID>_<Sentrix_Position>` | The user's sheet has no `Basename` column. |
| Explicit `Basename` | the row's `Basename` value, verbatim | The sheet carries a column named `Basename` (matched case/spacing-insensitively). |

Regardless of which input convention is in use, the canonicalizer **always writes a `Basename` column** into the output sheet (§4.1). The value is:

- **the user-supplied value**, when the input carries a `Basename` column — taken verbatim, so the downstream R consumer matches it literally; and
- **the synthesized array id** (`<Sentrix_ID>_<Sentrix_Position>`), when the input carries no such column.

When an explicit `Basename` column is present it is authoritative for locating and de-duplicating the IDAT files; the `Sentrix_ID`/`Sentrix_Position` columns remain present as metadata.

The `Basename` value propagates through the entire pipeline: minfi names each loaded sample by `basename(Basename)`, so per-sample data columns and group assignments always key on that identity. This is why a `Basename` sheet whose chip columns do not match the IDAT filenames still groups and annotates correctly.

---

## 4. Reference

### 4.1 Canonical columns

| Canonical name | Role | In canonical output | Notes |
|---|---|---|---|
| `Sentrix_ID` | Chip barcode | Always (required) | Part of the array id; links to IDAT files via the synthesized `Basename` when no explicit `Basename` column is supplied. |
| `Sentrix_Position` | Chip position | Always (required) | Part of the array id. |
| `Sample_Name` | Sample identity | Always (required) | Human-readable identifier. |
| `Sample_Group` | Biological group | Always (required) | Default source of comparison/batch/covariate selection. |
| `Basename` | IDAT file-name prefix | **Always (guaranteed)** | Always present in the canonical output. Value is the user-supplied prefix when the input carries a `Basename` column, or the synthesized `<Sentrix_ID>_<Sentrix_Position>` otherwise. See §3.6. |
| `Sample_Well` | Plate well | When present in input | Passed through verbatim if the input carries this column. |
| `Sample_Plate` | Plate id | When present in input | Passed through verbatim if the input carries this column. |
| `Pool_ID` | Pool id | When present in input | Passed through verbatim if the input carries this column. |
| *(any other column)* | User metadata | When present in input | Preserved verbatim; may serve as a runtime role column (§3.4). |

The four required columns are enforced at commit through the user mapping. Additional columns are never dropped — they remain available as candidate batch/covariate/comparison/annotation columns. The `Basename` column is always written last by the canonicalizer, guaranteeing its presence regardless of the input.

### 4.2 Recognized aliases (fallback detection)

When alias auto-detection is used, the following raw column names are recognized (matched case-insensitively and ignoring spaces/underscores) and renamed to their canonical form:

| Raw alias(es) | Canonical name |
|---|---|
| `Sentrix_ID`, `SentrixBarcode_A`, `Sentrix Barcode`, `Slide` | `Sentrix_ID` |
| `Sentrix_Position`, `SentrixPosition_A`, `Array` | `Sentrix_Position` |
| `Sample_Name` | `Sample_Name` |
| `Sample_Group` | `Sample_Group` |
| `Sample_Well` | `Sample_Well` |
| `Sample_Plate` | `Sample_Plate` |
| `Pool_ID` | `Pool_ID` |

`Slide`/`Array` are the names some tooling (e.g. minfi) assigns to the barcode/position columns; they are treated as equivalent to `Sentrix_ID`/`Sentrix_Position`.

### 4.3 Accepted input variations

Canonicalization tolerates all of the following and still produces the canonical output:

| Dimension | Accepted variations |
|---|---|
| Container | `.csv`, `.xlsx`, `.xls` |
| Delimiter (CSV) | comma `,`, semicolon `;`, or tab |
| Header block | with or without a leading `[Header]` / `[Data]` block |
| Column naming | canonical names, known aliases (§4.2), or arbitrary names mapped by the user |
| Barcode formatting | numeric barcodes that spreadsheet tools coerced to a float (e.g. `2.06891E+11`) are repaired back to the integer form so the IDAT match succeeds |

### 4.4 Canonical output

The single output of canonicalization is the canonical `SampleSheet.csv` (§3.2), stored in the job directory. Its location and lifecycle are defined in [job-directory-layout.md](./job-directory-layout.md). Its columns are the metadata source that [filter-mapping.md](./filter-mapping.md) and the batch/heatmap options draw upon.

The canonical sheet is **restricted to the uploaded samples**: rows whose IDAT linkage key (§3.6) does not correspond to an uploaded IDAT pair are dropped. This lets a user upload a subset of a large cohort sheet — the sheet may describe more samples than were uploaded — while keeping the job directory self-consistent (every remaining row has its IDAT files on disk). At least one row must match; a full mismatch is rejected (§5).

---

## 5. Error Cases / Edge Cases

Canonicalization rejects an upload (surfaced as an HTTP `400`, see [api-contract.md](../api/api-contract.md)) when it cannot honour the contract:

| Condition | Outcome |
|---|---|
| Unsupported container / unreadable file | Rejected — the sheet cannot be parsed. |
| No named columns, no data rows, or no usable table after `[Data]` | Rejected — there is nothing to canonicalize. |
| A mapped role points to a column absent from the sheet | Rejected — invalid column mapping. |
| The four roles are not mapped to four **distinct** columns | Rejected — each column may fill only one role. |
| The mapped chip columns produce array ids that match **none** of the selected IDAT pairs | Rejected — the wrong columns were almost certainly chosen (the sheet cannot be tied to the raw data). |

Edge cases that are **accepted**:

- Extra, unrecognized columns — preserved as user metadata.
- Barcodes mangled into floating-point notation by Excel — repaired.
- Mixed delimiter/quoting typical of exported CSVs — handled by delimiter detection.

The role-distinctness and column-existence rules are the same ones the upload contract exposes; this document is their canonical definition, and [api-contract.md](../api/api-contract.md) maps them to specific error responses.

---

## 6. Extension Points

- **Add a recognized alias.** Extend the alias table (§4.2) with the new raw name and its canonical target. This changes only fallback auto-detection; explicit user mapping is unaffected.
- **Add a canonical column.** Add it to §4.1, define its role and whether it is required, and update any consumer that reads it (batch/heatmap options, or an R script — see the [R scripts reference](../architecture/r_backend-architecture.md)).
- **Add a runtime role.** Runtime roles (§3.4) are defined by the consuming feature, not by this contract; document the new selection in [api-contract.md](../api/api-contract.md). This document need only guarantee the underlying columns exist.

Backward compatibility: already-canonical sheets and the alias-detection path must keep working, so canonical names and existing aliases must never be repurposed.
