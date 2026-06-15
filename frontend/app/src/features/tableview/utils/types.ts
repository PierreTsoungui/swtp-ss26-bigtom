/**
 * Entnommen aus API_CONTRACT (Stand 10.06.2026)
 */

/**
 * Filter für die Auswahl der DMPs, aus denen die Heatmap generiert wird.
 */
/*export type DmpFilter = {
    dmr_id?: string;
    chromosome?: string;
    start?: number;
    stop?: number;
    p_value_max?: number;
    adj_p_value_max?: number;
    delta_beta_min?: number;
    delta_beta_max?: number;
};*/
export interface HeatmapDmpFilter {
    dmr_id?: string;              // optional
    chromosome?: string;          // z.B. "chr19"
    start?: number;
    stop?: number;
    p_value_max?: number;
    adj_p_value_max?: number;
    delta_beta_min?: number;
    delta_beta_max?: number;
}


/**
 * Gruppierungsparameter für die Heatmap.
 */
export type HeatMapGrouping = {
    primary: string;
    secondary?: string;
};

/**
 * Request Body für POST /heatmap/{job_id}
 */
export type HeatMapRequest = {
    dmp_filter: HeatmapDmpFilter;
    grouping: HeatMapGrouping;
};

/**
 * Metadaten einer erfolgreich generierten Heatmap.
 */
export type HeatMapMetadata = {
    detected_cpgs: number;
    plotted_samples: number;
    message: string;
};

/**
 * Erfolgreiche Response von POST /heatmap/{job_id}
 */
export type HeatMapResponse = {
    job_id: string;
    phase: string;
    status: string;
    heatmap_metadata: HeatMapMetadata;
};

/**
 * Optionen für die Gruppierungs-Dropdowns.
 * GET /heatmap/{job_id}/options
 */
export type HeatMapOptionsResponse = {
    job_id: string;
    available_columns: string[];
};

/**
 * Fehlerdetails bei Überschreitung des CpG-Limits.
 */
export type HeatMapValidationErrorDetails = {
    current_count: number;
    max_allowed: number;
};

/**
 * Error Response von POST /heatmap/{job_id}
 */
export type HeatMapErrorResponse = {
    error: string;
    message: string;
    details?: HeatMapValidationErrorDetails;
};