import LinearProgress from '@mui/material/LinearProgress';
import {JobPhase, type JobStatus, JobStatusValue} from "../utils/JobTypes.ts";
import {Alert} from "@mui/material";

/**
 * Props für die Progressbar-Komponente.
 */
type ProgressbarProps = {
    /** Der aktuelle Status des Jobs mit allen Fortschrittsinformationen. */
    jobStatus: JobStatus;
    /** Bestimmt, ob der "Weiter"-Button angezeigt wird. */
    showNextButton?: boolean;
    /** Deaktiviert den "Weiter"-Button. */
    nextDisabled?: boolean;
    /** Callback-Funktion, wenn auf "Weiter" geklickt wird. */
    onNext?: () => void;
};


/**
 * Fortschrittsanzeige-Komponente, die den aktuellen Status eines Analysejobs visualisiert.
 * Sie zeigt den Fortschrittsbalken, die Anzahl der abgeschlossenen Schritte,
 * den aktuellen Schritt und die geschätzte verbleibende Zeit an.
 *
 * @param jobStatus - Aktueller Status des Analysejobs.
 * @param showNextButton - Flag zur Anzeige des Next-Buttons.
 * @param nextDisabled - Flag zum Deaktivieren des Next-Buttons.
 * @param onNext - Callback für den Klickevent.
 * @returns Das gerenderte JSX-Element.
 */
function Progressbar({ jobStatus, showNextButton = false, nextDisabled = true, onNext }: ProgressbarProps) {
    const finished = jobStatus.progress_percent === 100;

    const isFailed = jobStatus.status?.toLowerCase() === "failed" || jobStatus.status === JobStatusValue.FAILED;

    const currentError = isFailed ? jobStatus.error : null;

    const getProgressBarColor = () => {
        if (isFailed) return "error";
        if (finished) return "success";
        return "primary";
    }

    console.log("jobStatus:", jobStatus);
    console.log("status:", jobStatus.status);
    console.log("error:", jobStatus.error);
    console.log("isFailed:", isFailed);

    return (
        <div className="mx-auto w-full max-w-3xl rounded-2xl border border-neutral-borderDefault bg-neutral-card p-5 shadow-sm">
            {/* Error PopUp Snackbar */}
            {/*cancelError && (
                <ErrorMessage
                    open={true}
                    error={cancelError}
                    vertical={"top"}
                    horizontal={"center"}
                />
            )*/}

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-neutral-textPrimary">
                        {jobStatus.phase === JobPhase.NORMALIZATION_PREVIEW
                            ? "Creating normalization preview..."
                            : "Analyzing"}
                    </h2>
                </div>

                <div className="min-w-17.5 text-right text-sm font-medium text-neutral-textSecondary">
                    {jobStatus.progress_percent}%
                </div>
            </div>

            {/* Progressbar */}
            <div className="mb-5">
                <LinearProgress
                    variant="determinate"
                    color={getProgressBarColor()}
                    value={jobStatus.progress_percent}
                    sx={{height: 10, borderRadius: 9999,}}
                />
            </div>

            {/* Infos */}
            <div className="space-y-3 text-sm text-neutral-textSecondary">
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-neutral-textSecondary">
                        Current step
                    </span>
                    <span>{jobStatus.current_step}</span>
                </div>
                {currentError && (
                    <div className="w-full text-sm font-medium text-danger mt-3">
                        <Alert severity="error">{currentError.detail || "An unexpected error occurred."}</Alert>
                    </div>
                )}
            </div>

            {/* Footer */}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {showNextButton && (
                    <button
                        onClick={onNext}
                        disabled={nextDisabled}
                        className="inline-flex min-w-24 items-center justify-center rounded-full
                                 border-2 border-primary bg-primary px-6 py-3 font-bold text-primary-text transition-colors
                                 hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-neutral-textSecondary disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
                    >
                        Next
                    </button>
                )}
            </div>
        </div>
    );
}

export default Progressbar;
