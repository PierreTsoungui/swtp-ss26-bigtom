import { workflowSteps } from "./workflowSteps";

interface StepIndicatorProps {
  currentStepId?: number;
}

export function StepIndicator({ currentStepId }: StepIndicatorProps) {
  return (
    <nav aria-label="Schrittanzeige" className="w-full">
      <ol className="flex flex-wrap items-center justify-center gap-2 text-xs sm:gap-3">
        {workflowSteps.map((step) => {
          const isCurrent = step.id === currentStepId;

          return (
            <li key={step.id} className="flex items-center gap-2">
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-sm font-semibold ${
                  isCurrent
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                {step.id}
              </span>
              <span
                className={`hidden whitespace-nowrap sm:inline ${
                  isCurrent ? "font-semibold text-blue-700" : "text-slate-600"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
