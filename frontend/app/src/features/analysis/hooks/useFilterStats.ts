import { useEffect, useState } from "react";
import type { FilteringStatsType } from "../utils/types.ts";

/**
 * Result of the {@link useFilterStats} hook.
 */
interface UseFilterStatsResult {
    /** The calculated statistics for each filtering stage. */
    filterStats: FilteringStatsType | null;
    /** Whether the statistics are currently being fetched. */
    isLoading: boolean;
    /** Human-readable error message if the fetch failed. */
    error: string | null;
}

/**
 * Fetches the filtering audit trail and statistics for a specific job.
 *
 * @param jobId - The ID of the analysis job. If null, fetching is disabled.
 * @returns The current loading state and stats once processing is complete.
 */
export function useFilterStats(jobId: string | null): UseFilterStatsResult {
    const [filterStats, setFilterStats] = useState<FilteringStatsType | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!jobId) {
            setFilterStats(null);
            setError(null);
            return;
        }

        const fetchFilterStats = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/v1/filter/${jobId}/stats`, {
                    method: "GET",
                });

                if (!response.ok) {
                    if (response.status === 409) {
                        // Noch nicht fertig, das ist normal
                        setFilterStats(null);
                        return;
                    }
                    throw new Error(`Fehler ${response.status}: ${response.statusText}`);
                }

                const data : FilteringStatsType = await response.json();
                setFilterStats(data);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Unbekannter Fehler");
                setFilterStats(null);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFilterStats();
    }, [jobId]);

    return { filterStats, isLoading, error };
}