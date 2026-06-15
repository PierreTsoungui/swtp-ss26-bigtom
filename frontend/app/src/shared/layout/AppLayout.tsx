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
}

function getJobIdFromPath(pathname: string): string | null {
  const match = /^\/(?:analysis|normalization)\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

export function AppLayout({ children, resetAction }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLandingPage = location.pathname === "/";
  const currentStep = getWorkflowStepForPath(location.pathname);
  const jobId = useMemo(() => getJobIdFromPath(location.pathname), [location.pathname]);
  const currentPhase = location.pathname.startsWith("/datenschutz")
    ? "Datenschutz"
    : currentStep?.label ?? "BigTom";

  const { cancelJob, isLoading } = useJobCancel(jobId ?? "", () => {
    void navigate("/upload");
  });

  const isAnalysisActive = resetAction?.isAnalysisActive ?? jobId !== null;
  const handleReset = resetAction?.onReset ?? (() => {
    if (jobId) {
      void cancelJob();
    }
  });

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppHeader
        currentPhase={currentPhase}
        currentStepId={currentStep?.id}
        isLandingPage={isLandingPage}
        isAnalysisActive={isAnalysisActive}
        isResetting={resetAction?.isResetting ?? isLoading}
        onReset={handleReset}
      />
      <main className="flex-1">{children}</main>
      <AppFooter />
    </div>
  );
}
