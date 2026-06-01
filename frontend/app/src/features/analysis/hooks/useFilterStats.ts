import { useEffect, useState } from "react";
import type { FilteringStatsType } from "../utils/types.ts";

interface UseFilterStatsResult {
    filterStats: FilteringStatsType | null;
    isLoading: boolean;
    error: string | null;
}

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