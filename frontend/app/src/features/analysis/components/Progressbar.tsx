
import LinearProgressWithLabelAndValue from '@mui/material/LinearProgress';
import type { JobStatus } from '../utils/types';
import CancelButton from './CancelButton';

type ProgressbarProps = {
    jobStatus: JobStatus;
}

function Progressbar({ jobStatus }: ProgressbarProps) {
    return (
        <div className="w-full bg-gray-200 rounded-full h-4">
            <p>Schritte: {jobStatus.steps_completed} von {jobStatus.steps_total}</p>
            <LinearProgressWithLabelAndValue value={jobStatus.progress_percent} />
            <p>Aktueller Schritt: {jobStatus.current_step}</p>
            {jobStatus.estimated_seconds_remaining !== null && (
                <p>Geschätzte verbleibende Zeit: {jobStatus.estimated_seconds_remaining} Sekunden</p>
            )}
            <CancelButton onCancel={() => console.log("Analyse abgebrochen")} />
        </div>
    );
}
export default Progressbar;

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