import LinearProgress from '@mui/material/LinearProgress';
import type { JobStatus } from '../utils/types';
import CancelButton from './CancelButton';

type ProgressbarProps = {
    jobStatus: JobStatus;
};

function Progressbar({ jobStatus }: ProgressbarProps) {
    return (
        <div className="w-9/12 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                        Analyse läuft
                    </h2>
                    <p className="text-sm text-gray-500">
                        Schritte {jobStatus.steps_completed} von {jobStatus.steps_total}
                    </p>
                </div>

                <div className="min-w-17.5 text-right text-sm font-medium text-gray-700">
                    {jobStatus.progress_percent}%
                </div>
            </div>

            {/* Progressbar */}
            <div className="mb-5">
                <LinearProgress
                    variant="determinate"
                    value={jobStatus.progress_percent}
                    sx={{
                        height: 10,
                        borderRadius: 9999,
                    }}
                />
            </div>

            {/* Infos */}
            <div className="space-y-3 text-sm text-gray-700">
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-gray-500">
                        Aktueller Schritt
                    </span>
                    <span>{jobStatus.current_step}</span>
                </div>

                {jobStatus.estimated_seconds_remaining !== null && (
                    <div className="flex flex-col gap-1">
                        <span className="font-medium text-gray-500">
                            Verbleibende Zeit
                        </span>
                        <span>
                            {jobStatus.estimated_seconds_remaining} Sekunden
                        </span>
                    </div>
                )}
            </div>

            {/* Footer */}
            {/*
                TODO: (FÜR MAXIM!!!) onCancel Funktion implementieren, die den Request zum Abbrechen der Analyse an die API sendet.
                Warten bis Backend die Route implementiert hat
                Route müsste POST /reset/{job_id} sein
            */}

            <div className="mt-6 flex justify-center">
                <CancelButton
                    onCancel={() => console.log('Analyse abgebrochen')}
                />
            </div>
        </div>
    );
}

export default Progressbar;