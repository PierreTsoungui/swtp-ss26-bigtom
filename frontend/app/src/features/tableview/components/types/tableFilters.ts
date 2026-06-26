// DMP-Tabellenfilter (Strings, weil Input-Felder)
export interface DmpTableFilters {
    chr: string;
    start: string;
    stop: string;
    gene: string;          // Teilstring-Suche
    feature: string;       // genomische Region (TSS1500, Body, IGR, …)
    cgi: string;           // CpG-Kontext (Island, Shore, Shelf, OpenSea)
    adj_p_value: string;   // Achtung: im Contract heißt der Query-Parameter filter_adj_p_value (ohne _max)
    delta_beta: string;    // filter_delta_beta (absolut, |Δβ| ≥ x)
    delta_direction: string; // "hyper" | "hypo" | "" (beide)
    group2_avg_min: string;
    group2_avg_max: string;
    group1_avg_min: string;
    group1_avg_max: string;
    log_fc_min: string;
    log_fc_max: string;
    dmr_id: string;       // filter_dmr_id → DMP-Zeilen einer bestimmten DMR (exakt)
}

// DMR-Tabellenfilter
export interface DmrTableFilters {
    chr: string;
    dmrid: string;
    start: string;
    stop: string;
    p_value: string;
    mean_diff_min: string;
    mean_diff_max: string;
    width_min: string;
    width_max: string;
    n_dmps_min: string;
    n_dmps_max: string;
}

// Globaler State
export interface FilterState {
    dmp: DmpTableFilters;
    dmr: DmrTableFilters;
}