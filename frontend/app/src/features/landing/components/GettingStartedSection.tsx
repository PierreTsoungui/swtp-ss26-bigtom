import type { InformationCard } from "../types";

/**
 * Props for the {@link GettingStartedSection}.
 */
interface GettingStartedSectionProps {
  /** Plain-language topics that orient newcomers to the workflow. */
  topics: InformationCard[];
}

/**
 * Getting-started section: extended, plain-language explanations for users new
 * to DNA methylation analysis. Rendered under the `getting-started` anchor.
 *
 * @param props - The beginner topics to display.
 */
export function GettingStartedSection({ topics }: GettingStartedSectionProps) {
  return (
    <section
      id="getting-started"
      aria-labelledby="beginner-title"
      className="scroll-mt-24 border-y border-neutral-borderDefault bg-neutral-card px-6 py-16"
    >
      <div className="mx-auto max-w-7xl">
        <div className="max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-tertiary-hover">
            Getting started
          </p>
          <h2 id="beginner-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
            New to DNA methylation analysis?
          </h2>
          <p className="mt-4 leading-7 text-neutral-textSecondary">
            DNA methylation analysis transforms raw signal from a methylation array into a list of
            the genomic positions and regions that differ between groups of samples. Several
            processing steps are needed along the way, each addressing a specific technical or
            statistical issue, before biological conclusions can be drawn with confidence. The
            sections below explain the purpose of each stage in plain terms and describe how the
            individual steps fit together, so that users who are new to the field understand what
            the platform does with their data and why.
          </p>
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          {topics.map((topic) => (
            <article
              key={topic.title}
              className="rounded-xl border border-neutral-borderDefault bg-neutral-surface p-6"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-card text-tertiary-hover shadow-sm">
                {topic.icon}
              </div>
              <h3 className="text-lg font-semibold text-neutral-textPrimary">{topic.title}</h3>
              <p className="mt-2 text-sm leading-6 text-neutral-textSecondary">
                {topic.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
