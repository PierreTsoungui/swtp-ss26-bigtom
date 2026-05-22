import type {FilteringStatsType, FilterStats} from "./types.ts";

export function convertBackendFilterStats(stats: FilterStats): FilteringStatsType {
    let probesBefore = stats.total_before;

    const steps = stats.steps.map((step) => {
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