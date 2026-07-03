import type { ReactNode } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { useJobCancel } from "../../features/analysis/hooks/useJobCancel";
import { AppFooter } from "./AppFooter";
import { AppHeader } from "./AppHeader";
import { getWorkflowStepForPath } from "./workflowSteps";

interface ResetActionOverride {
  isAnalysisActive: boolean;
  onReset: () => void;
  isResetting?: boolean;
}

interface AppLayoutProps {
  children: ReactNode;
  resetAction?: ResetActionOverride;
  hideStepIndicator?: boolean;
}

function getJobIdFromPath(pathname: string): string | null {
  const match = /^\/(?:analysis|normalization)\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

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
