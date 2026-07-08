# Contract: Filter Mapping (End-to-End)

**Purpose:** Define the complete, authoritative filter contract as filters flow Frontend => Backend => result dataset: every filter, its query parameter, its operator, its target column, and its semantics.
**Scope:** The result-table filters (DMP and DMR) and the heatmap filters. The single filter layer shared by the table and heatmap features.

> This document is the **single source of truth for filter behaviour**. The endpoints that accept these filters are defined in [api-contract.md](../architecture/api-contract.md) (§7 Table, §8 Heatmap); the dataset columns referenced here originate from the differential-analysis result files in [job-directory-layout.md](./job-directory-layout.md); grouping metadata originates from the [sample sheet](./samplesheet-spec.md).

---

## 1. Purpose

Filters exist at three layers — the Frontend UI, the Backend query parameters, and the columns of the R-produced result datasets. Without a fixed contract they would drift apart. This document pins each filter to a single query parameter, operator, and target column, so that:

- the Frontend knows exactly which parameter to send and what value shape it expects;
- the Backend applies one well-defined semantics per filter;
- the table view and the heatmap select **exactly the same rows** for the same filter input.

---

## 2. Scope

In scope: the DMP and DMR table filters, the operator catalogue and semantics, value expectations, validation and error behaviour, and heatmap/table filter parity.

Out of scope: pagination and sorting (see [api-contract.md](../architecture/api-contract.md) §7), the exact Frontend field labels and the client-side conversion helpers (owned by the Frontend documentation), and the biological meaning of the metrics (see the [glossary](../glossary.md)).

---

## 3. Concepts / Contract

### 3.1 The three layers

```text
Frontend field      =>   Query parameter        =>   Backend filter          =>   Dataset column
(UI control)            filter_<key>=<value>       (key, operator)             (column in *_results.csv)
```

A filter is transmitted as a query parameter named `filter_<key>`. The Backend recognizes only parameters carrying the `filter_` prefix as filters; it strips the prefix to obtain the **filter key**, looks the key up in the table's filter map to get a `(column, operator)` pair, and applies the operator to that column of the result dataset.

### 3.2 Single filter source (table = heatmap parity)

The table view and the heatmap are driven by **one filter layer**. The heatmap applies the **DMP filter map** to the DMP results to decide which CpGs to render. Consequently, a given filter input selects exactly the same CpGs whether it is used to display the DMP table or to generate the heatmap. This parity is a guarantee, not a coincidence: both paths call the same filtering routine.

### 3.3 Keep-all-rows semantics

Filtering is a **selection for display/rendering only**. The stored result datasets are never culled server-side; significance thresholds and other criteria are applied on demand and can always be relaxed. The full result set remains available (e.g. via CSV export).

### 3.4 Reserved (non-filter) parameters

`page`, `sort_by`, and `sort_order` are reserved query parameters and are never interpreted as filters. Any other parameter **without** the `filter_` prefix is ignored.

---

## 4. Reference

### 4.1 Operator catalogue

| Operator | Semantics | Value expectation | Applicable column type |
|---|---|---|---|
| `eq` | Exact string equality (`"DMR_421"` does **not** match `"DMR_4211"`). | String | Identifier |
| `ci_eq` | Case-insensitive equality (data `"island"` matches filter `"Island"`). | String | Categorical label |
| `chr_eq` | Chromosome equality, tolerant to a leading `chr` prefix and to case (`"1"` matches `"chr1"`, `"chrX"` matches `"x"`). | String | Chromosome |
| `contains` | Case-insensitive substring match (`"HOX"` matches `HOXA1`). | String | Free-text label |
| `gte` | Value ≥ threshold. | Numeric | Numeric |
| `lte` | Value ≤ threshold. | Numeric | Numeric |
| `abs_gte` | Magnitude \|value\| ≥ threshold. | Numeric | Signed numeric |
| `abs_lte` | Magnitude \|value\| ≤ threshold. | Numeric | Signed numeric |
| `direction` | `hyper` keeps rows where the column > 0; `hypo` keeps rows where < 0; any other value imposes no constraint. | `hyper` \| `hypo` | Signed numeric |

Numeric operators require a value parseable as a number; a non-numeric value is a client error (§5).

### 4.2 DMP filters

Applied to `dmp_results.csv` (and, identically, to the heatmap CpG selection — §4.4).

| UI concept                | Query parameter                                   | Dataset column | Operator              | Meaning                                            |
|---------------------------|---------------------------------------------------|----------------|-----------------------|----------------------------------------------------|
| Chromosome                | `filter_chr`                                      | `CHR`          | `chr_eq`              | Match a chromosome, tolerant to `chr`-prefix/case. |
| Start position            | `filter_start`                                    | `POS`          | `gte`                 | Position ≥ value.                                  |
| Stop position             | `filter_stop`                                     | `POS`          | `lte`                 | Position ≤ value.                                  |
| Gene                      | `filter_gene`                                     | `GENE`         | `eq`                  | Exact gene symbol match (case-sensitive)           |
| Genomic feature           | `filter_feature`                                  | `FEATURE`      | `ci_eq`               | Region type (e.g. `TSS1500`, `Body`, `IGR`).       |
| CpG island context        | `filter_cgi`                                      | `CGI`          | `ci_eq`               | CpG context (e.g. `Island`, `Shore`).              |
| Adjusted p-value          | `filter_adj_p_value`                              | `ADJ_P`        | `lte`                 | Significance threshold (≤).                        |
| \|Δβ\| minimum            | `filter_delta_beta`                               | `DELTA_BETA`   | `abs_gte`             | Minimum effect magnitude \|Δβ\|.                   |
| Direction                 | `filter_delta_direction`                          | `DELTA_BETA`   | `direction`           | `hyper` (Δβ > 0) / `hypo` (Δβ < 0).                |
| Group 1 average (min/max) | `filter_group1_avg_min` / `filter_group1_avg_max` | `GROUP1_AVG`   | `gte` / `lte`         | Mean methylation of group 1 within a range.        |
| Group 2 average (min/max) | `filter_group2_avg_min` / `filter_group2_avg_max` | `GROUP2_AVG`   | `gte` / `lte`         | Mean methylation of group 2 within a range.        |
| log fold-change (min/max) | `filter_log_fc_min` / `filter_log_fc_max`         | `LOG_FC`       | `abs_gte` / `abs_lte` | Magnitude of the log fold-change within a range.   |
| DMR id                    | `filter_dmr_id`                                   | `DMR_ID`       | `eq`                  | Restrict to CpGs of one DMR (exact).               |

### 4.3 DMR filters

Applied to `dmr_results.csv`.

| UI concept | Query parameter | Dataset column | Operator | Meaning |
|---|---|---|---|---|
| Chromosome | `filter_chr` | `CHR` | `chr_eq` | Match a chromosome, tolerant to `chr`-prefix/case. |
| DMR id | `filter_dmrid` | `ID` | `eq` | Exact DMR id. |
| Start position | `filter_start` | `START` | `gte` | Region start ≥ value. |
| Stop position | `filter_stop` | `STOP` | `lte` | Region end ≤ value. |
| p-value | `filter_p_value` | `P_VALUE` | `lte` | Significance threshold (≤). |
| Mean difference (min/max) | `filter_mean_diff_min` / `filter_mean_diff_max` | `MEANDIFF` | `abs_gte` / `abs_lte` | Magnitude of the mean methylation difference within a range. |
| Width (min/max) | `filter_width_min` / `filter_width_max` | `WIDTH` | `gte` / `lte` | Region width within a range. |
| CpG count (min/max) | `filter_n_dmps_min` / `filter_n_dmps_max` | `N_DMPS` | `gte` / `lte` | Number of CpGs in the region within a range. |

### 4.4 Heatmap compatibility

The heatmap accepts the **same flat filter map** as the DMP table (the keys of §4.2), supplied in the request body rather than as query parameters (see [api-contract.md](../architecture/api-contract.md) §8). It is applied to the DMP results to select the CpGs to render. Two heatmap-specific rules apply **after** filtering:

- the selection must be non-empty (an empty selection is a client error);
- the selection must not exceed the heatmap's CpG cap (currently 500), otherwise the client must tighten the filter.

These bounds do not change the filter semantics; they gate the render.

---

## 5. Error Cases / Edge Cases

| Condition | Behaviour |
|---|---|
| **Unknown filter key** (not in the table's map) | Rejected with `400` — `Unknown filter: <key>`. |
| **Non-numeric value** for a numeric/`abs`/range operator | Rejected with `400` — `Invalid filter value: <value>`. |
| **Mapped column absent** from the dataset | The filter is **silently skipped** (the remaining filters still apply). This tolerates datasets that legitimately lack an optional column. |
| **Unknown value** for `direction` (e.g. `both`) | No constraint is imposed (all rows pass that filter). |
| **No filters supplied** | Valid — the full result set is returned/rendered. |
| **Unknown table** (`table` ≠ `dmp`/`dmr`) | Rejected by the table endpoint before filtering (`400`). |

The `400` responses follow the standard error format defined in [api-contract.md](../architecture/api-contract.md).

---

## 6. Extension Points

To add a filter:

1. Choose a filter key and add a `filter_<key>` => `(column, operator)` entry to the relevant table map (DMP and/or DMR) in this reference.
2. Reuse an existing operator from §4.1 where possible; introduce a new operator only if no existing one expresses the semantics, and define it in the catalogue with its value expectation and applicable column type.
3. Ensure the target column exists in the corresponding result dataset (see [job-directory-layout.md](./job-directory-layout.md) and the [R scripts reference](../r-backend/scripts-reference.md)); if it does not, the filter will be silently skipped.
4. If the filter should apply to the heatmap, confirm it belongs to the DMP map (§4.4).

A filter is part of the contract only once it appears in the §4 tables. Existing keys, operators, and column names must not be repurposed, to preserve backward compatibility and table/heatmap parity.