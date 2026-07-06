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
      <ol className="flex flex-wrap items-center justify-center gap-2 text-sm sm:gap-3">
        {workflowSteps.map((step) => {
          const isCurrent = step.id === currentStepId;
          const isCompleted = currentStepId !== undefined && step.id < currentStepId;
          const statusText = isCurrent
            ? "Aktueller Schritt"
            : isCompleted
              ? "Abgeschlossen"
              : "Ausstehend";

          return (
            <li
              key={step.id}
              aria-current={isCurrent ? "step" : undefined}
              className="flex items-center gap-2"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm font-semibold ${
                  isCurrent
                    ? "border-primary bg-primary text-primary-text"
                    : isCompleted
                      ? "border-success bg-success-badgeBackground text-success-badgeText"
                      : "border-neutral-textSecondary bg-neutral-card text-neutral-textSecondary"
                }`}
              >
                {/* A completed step shows only the check mark; otherwise the
                    number. Rendering just one glyph keeps it perfectly centered
                    (previously the number + check shifted the number sideways). */}
                {isCompleted ? (
                  <span aria-hidden="true" className="leading-none">
                    ✓
                  </span>
                ) : (
                  <span>{step.id}</span>
                )}
              </span>
              <span className="hidden whitespace-nowrap sm:inline">
                <span
                  className={
                    isCurrent ? "font-semibold text-primary" : "text-neutral-textSecondary"
                  }
                >
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
