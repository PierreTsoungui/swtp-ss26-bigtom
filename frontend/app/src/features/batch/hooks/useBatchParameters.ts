import { useEffect, useState } from "react";
import type {BatchParametersResponse} from "../utils/types.ts";

export function useBatchParameters(jobId: string | null) {
    const [parameters, setParameters] = useState<BatchParametersResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // TODO: API CALL ANPASSEN NACH BACKEND INTEGRATION
    // Aktuell MVerwendung von Mockdaten
    useEffect(() => {
        if (!jobId) return;

        setTimeout(() => {
            setParameters({
                job_id: jobId,
                available_columns: [
                    "Sample_Group",
                    "Slide",
                    "Sentrix_ID",
                    "Sentrix_Position",
                    "Sex",
                    "Age"
                ]
            });

            setIsLoading(false);
        }, 300);
    }, [jobId]);

    return {
        parameters,
        isLoading
    };
}