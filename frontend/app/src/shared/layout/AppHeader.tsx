import { StepIndicator } from "./StepIndicator";

interface AppHeaderProps {
  currentPhase: string;
  currentStepId?: number;
  isAnalysisActive: boolean;
  isResetting?: boolean;
  onReset: () => void;
}

export function AppHeader({
  currentPhase,
  currentStepId,
  isAnalysisActive,
  isResetting = false,
  onReset,
}: AppHeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white px-6 py-4">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[1fr_3fr_1fr] lg:items-center">
        <div>
          <p className="text-2xl font-bold text-slate-900">BigTom</p>
        </div>

        <div className="space-y-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {currentPhase}
          </p>
          <StepIndicator currentStepId={currentStepId} />
        </div>

        <div className="flex justify-start lg:justify-end">
          <button
            type="button"
            onClick={onReset}
            disabled={!isAnalysisActive || isResetting}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-red-300 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-300 disabled:hover:text-slate-700"
          >
            {isResetting ? "Reset läuft..." : "Reset"}
          </button>
        </div>
      </div>
    </header>
  );
}
