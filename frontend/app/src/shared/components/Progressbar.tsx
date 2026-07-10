import LinearProgress from "@mui/material/LinearProgress";
import { JobPhase, type JobStatus, JobStatusValue } from "../types/JobTypes.ts";
import { Alert } from "@mui/material";
import { Button } from "./Button";

/**
 * Props for the Progressbar component.
 */
type ProgressbarProps = {
  /**
   * The current status of the job with all progress information.
   * @see {@link JobStatus}
   */
  jobStatus: JobStatus;

  /**
   * Determines whether the "Next" button is displayed.
   * @default false
   */
  showNextButton?: boolean;

  /**
   * Determines whether the "Next" button is disabled.
   * @default true
   */
  nextDisabled?: boolean;

  /** Callback function, when the "Next" button is clicked. */
  onNext?: () => void;
};

/**
 * Progressbar component that visualizes the current status of an analysis job.
 * It displays the progress bar, the current step, the percentage of completion, and any error messages if the job has failed.
 * Optionally, it can also display a "Next" button to proceed to the next step in the workflow.
 */
function Progressbar({
  jobStatus,
  showNextButton = false,
  nextDisabled = true,
  onNext,
}: ProgressbarProps) {
  const finished = jobStatus.progress_percent === 100;

  const isFailed =
    jobStatus.status?.toLowerCase() === "failed" || jobStatus.status === JobStatusValue.FAILED;

  const currentError = isFailed ? jobStatus.error : null;

  const getProgressBarColor = () => {
    if (isFailed) return "error";
    if (finished) return "success";
    return "primary";
  };

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl border border-neutral-borderDefault bg-neutral-card p-5 shadow-sm">
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
          sx={{ height: 10, borderRadius: 9999 }}
        />
      </div>

      {/* Infos */}
      <div className="space-y-3 text-sm text-neutral-textSecondary">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-neutral-textSecondary">Current step</span>
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
          <Button variant="primary" onClick={onNext} disabled={nextDisabled} className="min-w-24">
            Next
          </Button>
        )}
      </div>
    </div>
  );
}

export default Progressbar;
