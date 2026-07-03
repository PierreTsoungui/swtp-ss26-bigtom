import AnalyticsIcon from "@mui/icons-material/Analytics";
import { Link } from "react-router";
import { StepIndicator } from "./StepIndicator";

interface AppHeaderProps {
  currentPhase: string;
  currentStepId?: number;
  isLandingPage?: boolean;
  isAnalysisActive: boolean;
  isResetting?: boolean;
  onReset: () => void;
}

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
        <Link to="/" className="inline-flex items-center gap-2 text-2xl font-bold text-neutral-textPrimary hover:text-primary-hover">
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
                className="rounded-md border border-neutral-textSecondary bg-neutral-card px-4 py-2 text-sm font-semibold text-neutral-textSecondary transition-colors hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:border-neutral-borderEmphasis disabled:bg-neutral-surface disabled:text-neutral-textSecondary disabled:hover:border-neutral-borderEmphasis disabled:hover:text-neutral-textSecondary"
              >
                {isResetting ? "Reset läuft..." : "Reset"}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
