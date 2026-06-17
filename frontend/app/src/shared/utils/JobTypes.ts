import type { ProblemDetail } from '../error-handling/types/ErrorTypes.ts';

/**
 * Definiert die möglichen Statuswerte für einen Job.
 * - RUNNING: Der Job wird derzeit ausgeführt.
 * - WAITING: Der Job wartet auf eine Aktion, z.B. Benutzereingabe.
 * - COMPLETED: Der Job wurde erfolgreich abgeschlossen.
 * - FAILED: Der Job ist fehlgeschlagen.
 */
export const JobStatusValue = {
    RUNNING: 'running',
    WAITING: 'waiting',
    COMPLETED: 'completed',
    FAILED: 'failed',
} as const;
export type JobStatusValue = (typeof JobStatusValue)[keyof typeof JobStatusValue];

export const JobPhase = {
    UPLOADED: 'uploaded',
    FILTERING: 'filtering',
    NORMALIZATION_PREVIEW: 'normalization_preview',
    NORMALIZATION: 'normalization',
    SVD: 'svd',
    BATCH: 'batch',
    ANALYSIS: 'analysis',
    RESULTS: 'results',
    HEATMAP: 'heatmap',
} as const;
export type JobPhase = (typeof JobPhase)[keyof typeof JobPhase];

export interface JobStatus {
    job_id: string;
    status: JobStatusValue;
    phase: JobPhase;
    progress_percent: number;
    current_step: string;
    error?: ProblemDetail | null;
}
