import type { InformationCard } from "../types";

/**
 * Props for the {@link WorkflowSection}.
 */
interface WorkflowSectionProps {
  /** The ordered pipeline stages to render as numbered cards. */
  steps: InformationCard[];
}

/**
 * Workflow section: a numbered, ordered list of the pipeline stages from raw
 * files to interpretable results. Rendered under the `workflow` anchor.
 *
 * @param props - The workflow steps to display.
 */
export function WorkflowSection({ steps }: WorkflowSectionProps) {
  return (
    <section id="workflow" aria-labelledby="workflow-title" className="scroll-mt-24 px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            Analysis workflow
          </p>
          <h2 id="workflow-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
            From raw files to interpretable results
          </h2>
          <p className="mt-4 leading-7 text-neutral-textSecondary">
            The analysis proceeds through five stages, while you retain control over the
            normalization and batch correction decisions.
          </p>
        </div>

        <ol className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-2xl border border-neutral-borderDefault bg-neutral-card p-6 shadow-sm"
            >
              <span className="absolute right-5 top-5 text-sm font-bold text-neutral-borderEmphasis">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-info-badgeBackground text-info-hover">
                {step.icon}
              </div>
              <h3 className="text-lg font-semibold text-neutral-textPrimary">{step.title}</h3>
              <p className="mt-3 text-sm leading-6 text-neutral-textSecondary">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
