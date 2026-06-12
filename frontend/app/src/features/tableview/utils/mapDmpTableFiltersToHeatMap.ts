// utils/mapToHeatmapFilter.ts


import type {HeatmapDmpFilter} from "./types.ts";
import type {DmpTableFilters} from "../components/types/tableFilters.ts";

function toNumberOrUndef(value: string | undefined): number | undefined {
    if (!value || value.trim() === "") return undefined;
    const num = Number(value);
    return isNaN(num) ? undefined : num;
}

export function mapDmpTableFiltersToHeatmap(
    tableFilters: DmpTableFilters
): HeatmapDmpFilter {
    return {
        chromosome: tableFilters.chr || undefined,
        start: toNumberOrUndef(tableFilters.start),
        stop: toNumberOrUndef(tableFilters.stop),
        adj_p_value_max: toNumberOrUndef(tableFilters.adj_p_value),
        delta_beta_min: toNumberOrUndef(tableFilters.delta_beta),
        // p_value_max, dmr_id etc. sind im DmpTableFilters nicht vorhanden,
        // daher hier nicht gemappt.
    };
}