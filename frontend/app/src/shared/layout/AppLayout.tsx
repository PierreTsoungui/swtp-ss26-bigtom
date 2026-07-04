import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useJobCancel } from "../../features/analysis/hooks/useJobCancel";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { getWorkflowStepForPath } from "./workflowSteps";

/**
 * Configuration to override the default reset behavior of the layout.
 */
interface ResetActionOverride {
  /** Explicitly controls whether the reset action is available. */
  isAnalysisActive: boolean;
  /** Custom logic to execute when the reset button is clicked. */
  onReset: () => void;
  /** Whether the custom reset operation is currently in progress. */
  isResetting?: boolean;
}

/**
 * Props for the AppLayout component.
 */
interface AppLayoutProps {
  /** The page content to be rendered within the main area. */
  children: ReactNode;
  /** Optional overrides for the header's reset functionality. */
  resetAction?: ResetActionOverride;
  /**
   * If true, forces the step indicator to be hidden regardless of the current route.
   * Also resets the header phase label to the default branding.
   * @default false
   */
  hideStepIndicator?: boolean;
}

/**
 * Extracts the job ID from the current URL path using a regular expression.
 * Supported paths: /analysis/:id, /normalization/:id.
 *
 * @param pathname - The current URL path.
 * @returns The job ID or null if not found.
 */
function getJobIdFromPath(pathname: string): string | null {
  const match = /^\/(?:analysis|normalization)\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

/**
 * The main structural wrapper for the application.
 *
 * It synchronizes the {@link AppHeader} and {@link AppFooter} with the current
 * routing state, manages the global job cancellation (reset) logic, and
 * identifies the active workflow phase.
 */
export function AppLayout({ children, resetAction, hideStepIndicator = false }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLandingPage = location.pathname === "/";
  const currentStep = getWorkflowStepForPath(location.pathname);
  const jobId = useMemo(() => getJobIdFromPath(location.pathname), [location.pathname]);

  const showStepIndicator = !hideStepIndicator && currentStep !== undefined;
  let currentPhase = currentStep?.label ?? "BigTom";

  if (location.pathname.startsWith("/datenschutz")) {
    currentPhase = "Datenschutz";
  }

  if (hideStepIndicator) {
    currentPhase = "BigTom";
  }

  const { cancelJob, isLoading } = useJobCancel(jobId ?? "", () => {
    void navigate("/upload");
  });

  const isAnalysisActive = !hideStepIndicator && (resetAction?.isAnalysisActive ?? jobId !== null);
  const handleReset = resetAction?.onReset ?? (() => {
    if (jobId) {
      void cancelJob();
    }
  });

  return (
    <div className="flex min-h-screen flex-col bg-neutral-background">
      <AppHeader
        currentPhase={currentPhase}
        currentStepId={currentStep?.id}
        isLandingPage={isLandingPage}
        showStepIndicator={showStepIndicator}
        isAnalysisActive={isAnalysisActive}
        isResetting={resetAction?.isResetting ?? isLoading}
        onReset={handleReset}
      />
      <main className="flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}
