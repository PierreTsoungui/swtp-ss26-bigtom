import { workflowSteps } from "./workflowSteps";

interface StepIndicatorProps {
  currentStepId?: number;
}

export function StepIndicator({ currentStepId }: StepIndicatorProps) {
  return (
    <nav aria-label="Schrittanzeige" className="w-full">
      <ol className="flex flex-wrap items-center justify-center gap-2 text-sm sm:gap-3">
        {workflowSteps.map((step) => {
          const isCurrent = step.id === currentStepId;
          const isCompleted = currentStepId !== undefined && step.id < currentStepId;
          const statusText = isCurrent ? "Aktueller Schritt" : isCompleted ? "Abgeschlossen" : "Ausstehend";

          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-semibold ${
                  isCurrent
                    ? "border-primary bg-primary text-primary-text"
                    : isCompleted
                      ? "border-success bg-success-badgeBackground text-success-badgeText"
                      : "border-neutral-textSecondary bg-neutral-card text-neutral-textSecondary"
                }`}
              >
                <span>{step.id}</span>
                {isCompleted && (
                  <span aria-hidden="true" className="ml-1 text-xs leading-none">
                    ✓
                  </span>
                )}
              </span>
              <span className="hidden whitespace-nowrap sm:inline">
                <span className={isCurrent ? "font-semibold text-primary" : "text-neutral-textSecondary"}>
                  {step.label}
                </span>
                <span className="sr-only">, {statusText}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
