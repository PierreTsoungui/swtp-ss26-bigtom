import { workflowSteps } from "./workflowSteps";


/**
 * Props for the StepIndicator component.
 */
interface StepIndicatorProps {
    /**
     * The ID of the currently active step.
     * Used to highlight the current position in the sequence.
     */
    currentStepId?: number;
}

/**
 * A visual progress tracker that displays the sequential steps of the analysis.
 *
 * It maps the static {@link workflowSteps} configuration to a breadcrumb-like
 * navigation bar, highlighting the active step based on its ID.
 */
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
                    ? "border-primary bg-primary text-primary-text"
                    : "border-neutral-borderEmphasis bg-neutral-card text-neutral-textSecondary"
                }`}
              >
                {step.id}
              </span>
              <span
                className={`hidden whitespace-nowrap sm:inline ${
                  isCurrent ? "font-semibold text-primary" : "text-neutral-textSecondary"
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
