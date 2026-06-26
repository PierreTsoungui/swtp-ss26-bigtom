/**
 * Heatmap API types. The heatmap reuses the exact same filters as the DMP table
 * (single filter source — see docs/architecture/heatmap-konzept.md), so the
 * request simply forwards the applied table filters as a flat string map.
 */

/**
 * Grouping parameters for the heatmap annotation bars.
 */
export type HeatMapGrouping = {
    primary: string;
    secondary?: string;
};

/**
 * Request body for POST /heatmap/{job_id}.
 * `filters` mirrors the applied DMP table filters ({ filterKey: value }).
 */
export type HeatMapRequest = {
    filters: Record<string, string>;
    grouping: HeatMapGrouping;
};

/**
 * Metadata of a successfully started/generated heatmap.
 */
export type HeatMapMetadata = {
    detected_cpgs: number;
    plotted_samples: number;
    message: string;
};

/**
 * Successful response of POST /heatmap/{job_id}.
 */
export type HeatMapResponse = {
    job_id: string;
    phase: string;
    status: string;
    heatmap_metadata: HeatMapMetadata;
};

/**
 * A sample-sheet column offered as a heatmap annotation.
 * `type` is a hint: "categorical" | "continuous" | "identifier".
 */
export type AnnotationColumn = {
    name: string;
    type: string;
    n_distinct: number;
};

/**
 * Options for the grouping dropdowns. GET /heatmap/{job_id}/options
 */
export type HeatMapOptionsResponse = {
    job_id: string;
    available_columns: AnnotationColumn[];
};

/**
 * Error response of POST /heatmap/{job_id}.
 */
export type HeatMapErrorResponse = {
    error: string;
    message: string;
    detail?: string;
};
