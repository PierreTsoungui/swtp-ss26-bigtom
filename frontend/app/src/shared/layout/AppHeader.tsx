import AnalyticsIcon from "@mui/icons-material/Analytics";
import { Link } from "react-router";
import { StepIndicator } from "./StepIndicator";

/**
 * Props for the AppHeader component.
 */
interface AppHeaderProps {
  /** The name of the current analysis phase in header (e.g., "Filtering", "Normalization"). */
  currentPhase: string;
  /** The ID of the active step, passed to the {@link StepIndicator}. */
  currentStepId?: number;
  /**
   * If true, hides progress indicators and shows a simplified layout.
   * @default false
   */
  isLandingPage?: boolean;
  /** Whether an analysis is currently loaded or running, enabling the reset option. */
  isAnalysisActive: boolean;
  /**
   * Whether the reset operation is currently being processed.
   * @default false
   */
  isResetting?: boolean;
  /** Callback triggered when the user confirms an application reset. */
  onReset: () => void;
}

/**
 * The primary navigation and status header of the application.
 *
 * It displays the brand logo, tracks the user's progress through the
 * analysis pipeline using a {@link StepIndicator}, and provides a
 * global reset action.
 */
export function AppHeader({
  currentPhase,
  currentStepId,
  isLandingPage = false,
  isAnalysisActive,
  isResetting = false,
  onReset,
}: AppHeaderProps) {
  return (
    <header className="border-b border-neutral-borderDefault bg-neutral-card px-6 py-4">
      <div
        className={`mx-auto max-w-7xl ${
          isLandingPage
            ? "flex items-center justify-between"
            : "grid gap-4 lg:grid-cols-[1fr_3fr_1fr] lg:items-center"
        }`}
      >
        <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-neutral-textPrimary">
          <AnalyticsIcon fontSize="large" />
          <span>MethylAnalyzer</span>
        </Link>

        {!isLandingPage && (
          <>
            <div className="space-y-2 text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-neutral-textSecondary">
                {currentPhase}
              </p>
              <StepIndicator currentStepId={currentStepId} />
            </div>

            <div className="flex justify-start lg:justify-end">
              <button
                type="button"
                onClick={onReset}
                disabled={!isAnalysisActive || isResetting}
                className="rounded-md border border-neutral-borderEmphasis px-4 py-2 text-sm font-semibold text-neutral-textSecondary transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-borderEmphasis disabled:hover:text-neutral-textSecondary"
              >
                {isResetting ? "Resetting..." : "Reset"}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
