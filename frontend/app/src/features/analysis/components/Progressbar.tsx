import LinearProgress from '@mui/material/LinearProgress';
import type { JobStatus } from '../utils/types';
import CancelButton from './CancelButton';
import {useJobCancel} from "../hooks/useJobCancel.ts";
import ErrorMessage from "../../../shared/error-handling/components/ErrorMessage.tsx";
import {useNavigate} from "react-router";

/**
 * Props, die an die Progressbar übergeben werden
 * @property {JobStatus} jobStatus - Der aktuelle Status des Jobs, der die Fortschrittsinformationen enthält.
 */
type ProgressbarProps = {
    jobStatus: JobStatus;
    showNextButton?: boolean;
    nextDisabled?: boolean;
    onNext?: () => void;
};

/**
 * Fortschrittsanzeige-Komponente, die den aktuellen Status eines Analysejobs visualisiert.
 * Sie zeigt den Fortschrittsbalken, die Anzahl der abgeschlossenen Schritte,
 * den aktuellen Schritt und die geschätzte verbleibende Zeit an.
 * Außerdem enthält sie einen Button zum Abbrechen der Analyse.
 *
 * @param props - Props der Progressbar-Komponente
 * @param props.jobStatus - Aktueller Status des Analysejobs
 * @returns Die gerenderte Fortschrittsanzeige
 */
function Progressbar({ jobStatus, showNextButton = false, nextDisabled = true, onNext }: ProgressbarProps) {
    const navigate = useNavigate();
    const handleCancelSuccess = () => {
        navigate("/upload");
    };

    const { cancelJob, isLoading: isLoadingJobAbort, error: cancelError } = useJobCancel(jobStatus.job_id, handleCancelSuccess);

    return (
        <div className="w-9/12 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {/* Error PopUp Snackbar */}
            {cancelError && (
                <ErrorMessage
                    open={true}
                    error={cancelError}
                    vertical={"top"}
                    horizontal={"center"}
                />
            )}

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                        {jobStatus.phase === "normalization_preview"
                            ? "Normalisierungsvorschau wird erstellt"
                            : "Analyse läuft"}
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
                    sx={{height: 10, borderRadius: 9999,}}
                />
            </div>

            {/* Cancel Status*/}
            {isLoadingJobAbort && (
                <p className="text-sm text-gray-500 mb-3">Job wird abgebrochen...</p>
            )}

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

            <div className="mt-6 flex justify-center gap-3">
                <CancelButton
                    onCancel={cancelJob}
                    disabled={isLoadingJobAbort}
                />

                {showNextButton && (
                    <button
                    onClick={onNext}
                    disabled={nextDisabled}
                    className="w-36 bg-blue-500 hover:bg-blue-700 text-white font-bold py-3 rounded-full transition-colors disabled:bg-gray-300"
                    >
                    Next
                    </button>
                )}
            </div>
        </div>
    );
}

export default Progressbar;