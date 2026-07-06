import BookIcon from "@mui/icons-material/Book";

import type { DictionaryItem } from "../types";

/**
 * Props for the {@link GlossarySection}.
 */
interface GlossarySectionProps {
  /** Glossary entries to render as a grid of term/definition cards. */
  entries: DictionaryItem[];
}

/**
 * Biological & technical glossary section: a grid of term/definition cards for
 * the scientific vocabulary used throughout the workflow. Rendered under the
 * `glossary` anchor.
 *
 * @param props - The glossary entries to display.
 */
export function GlossarySection({ entries }: GlossarySectionProps) {
  return (
    <section
      id="glossary"
      aria-labelledby="glossary-title"
      className="scroll-mt-24 border-t border-neutral-borderDefault bg-neutral-card px-6 py-16"
    >
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-success">
            Knowledge Base
          </p>
          <h2 id="glossary-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
            Biological & Technical Glossary
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-neutral-textSecondary">
            Look up the scientific terms, parameters, and methods that appear throughout the
            workflow steps.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {entries.map((item) => (
            <div
              key={item.term}
              className="rounded-xl border border-neutral-borderDefault bg-neutral-background p-5"
            >
              <div className="flex items-center gap-2">
                <BookIcon className="h-5 w-5 text-success" fontSize="small" />
                <h4 className="font-bold text-neutral-textPrimary">{item.term}</h4>
              </div>
              <p className="mt-2 text-sm leading-6 text-neutral-textSecondary">{item.definition}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
