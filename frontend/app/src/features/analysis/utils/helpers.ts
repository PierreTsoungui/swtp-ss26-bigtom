import type {FilteringStatsType, FilterStats} from "./types.ts";

/**

 * @param stats
 */
export function convertBackendFilterStats(stats: FilterStats | any): FilteringStatsType | null {
    if (!stats) return null;

    if (stats.total_start && stats.det_p) {
        const steps = [];

        // Nur aktivierte Filter anzeigen
        if (stats.det_p?.enabled) {
            steps.push({
                name: "Detection P-Value",
                probesBefore: stats.total_start,
                removed: stats.det_p.removed,
                probesAfter: stats.det_p.after,
            });
        }

        if (stats.bead_count?.enabled) {
            steps.push({
                name: "Bead Count",
                probesBefore: stats.bead_count.removed ? stats.det_p.after : stats.total_start,
                removed: stats.bead_count.removed,
                probesAfter: stats.bead_count.after,
            });
        }

        if (stats.non_cpg?.enabled) {
            steps.push({
                name: "Non-CpG",
                probesBefore: stats.non_cpg.removed ? stats.bead_count.after : stats.total_start,
                removed: stats.non_cpg.removed,
                probesAfter: stats.non_cpg.after,
            });
        }

        if (stats.snp?.enabled) {
            steps.push({
                name: "SNP",
                probesBefore: stats.snp.removed ? stats.non_cpg.after : stats.total_start,
                removed: stats.snp.removed,
                probesAfter: stats.snp.after,
            });
        }

        if (stats.multi_hit?.enabled) {
            steps.push({
                name: "Multi-Hit",
                probesBefore: stats.multi_hit.removed ? stats.snp.after : stats.total_start,
                removed: stats.multi_hit.removed,
                probesAfter: stats.multi_hit.after,
            });
        }

        if (stats.xy_chromosomes?.enabled) {
            steps.push({
                name: "XY Chromosomes",
                probesBefore: stats.xy_chromosomes.removed ? stats.multi_hit.after : stats.total_start,
                removed: stats.xy_chromosomes.removed,
                probesAfter: stats.xy_chromosomes.after,
            });
        }

        // Sample Quality ist immer dabei
        if (stats.sample_quality?.enabled) {
            steps.push({
                name: "Sample Quality",
                probesBefore: stats.total_end,
                removed: stats.sample_quality.samples_removed,
                probesAfter: stats.total_end,
            });
        }

        return {
            steps,
            finalProbeCount: stats.total_end,
        };
    }


    // (Als Fallback)
    if (stats.total_before && stats.steps && Array.isArray(stats.steps)) {
        let probesBefore = stats.total_before;

        const steps = stats.steps.map((step: { removed: number; name: any; }) => {
            const probesAfter = Math.max(probesBefore - step.removed, 0);
            const convertedStep = {
                name: step.name,
                probesBefore,
                removed: step.removed,
                probesAfter,
            };

            probesBefore = probesAfter;
            return convertedStep;
        });

        return {
            steps,
            finalProbeCount: stats.remaining,
        };
    }

    return null;
}