
import LinearProgressWithLabelAndValue from '@mui/material/LinearProgress';
import type { JobStatus } from '../utils/types';

function Progressbar({ data }: { data : JobStatus }) {
    return (
        
        <div className="w-full bg-gray-200 rounded-full h-4">
            <p>Schritte: {data.steps_completed} von {data.steps_total}</p>
            <LinearProgressWithLabelAndValue value={data.progress_percent} />
            <p>Aktueller Schritt: {data.current_step}</p>
            {data.estimated_seconds_remaining !== null && (
                <p>Geschätzte verbleibende Zeit: {data.estimated_seconds_remaining} Sekunden</p>
            )}
        </div>
    );
}

/*
export interface JobStatus {
  job_id: string;
  status: JobStatusValue;
  phase: JobPhase;
  progress_percent: number;
  current_step: string;
  steps_total: number;
  steps_completed: number;
  filter_stats: FilterStats | null;
  estimated_seconds_remaining: number | null;
  error?: ProblemDetail;
}*/