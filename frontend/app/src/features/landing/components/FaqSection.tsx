import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

import type { FaqCategory } from "../types";
import { faqCategoryId } from "../utils/faqCategoryId";

/**
 * Props for the {@link FaqSection}.
 */
interface FaqSectionProps {
  /** FAQ content grouped by topic; each group renders an accordion of Q&A pairs. */
  categories: FaqCategory[];
}

/**
 * Help & FAQ section: topic-grouped questions rendered as native, accessible
 * `<details>` accordions. Rendered under the `help` anchor.
 *
 * @param props - The FAQ categories to display.
 */
export function FaqSection({ categories }: FaqSectionProps) {
  return (
    <section id="help" aria-labelledby="help-title" className="scroll-mt-24 px-6 py-16">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Help & FAQ</p>
          <h2 id="help-title" className="mt-2 text-3xl font-bold text-neutral-textPrimary">
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-neutral-textSecondary">
            Browse common questions by topic. The answers provide practical guidance on preparing
            data, running the analysis, and interpreting the results.
          </p>
        </div>

        <div className="mt-10 space-y-6">
          {categories.map((category) => {
            const categoryId = faqCategoryId(category.title);

            return (
              <section
                key={category.title}
                aria-labelledby={categoryId}
                className="rounded-2xl border border-neutral-borderDefault bg-neutral-card p-5 shadow-sm"
              >
                <h3 id={categoryId} className="mb-3 text-lg font-semibold text-neutral-textPrimary">
                  {category.title}
                </h3>
                <div className="divide-y divide-neutral-borderDefault">
                  {category.questions.map((item) => (
                    <details key={item.question} className="group py-3">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-1.5 font-medium text-neutral-textPrimary transition-colors hover:bg-neutral-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                        <span>{item.question}</span>
                        <ExpandMoreIcon
                          fontSize="small"
                          aria-hidden
                          className="shrink-0 text-neutral-textSecondary transition-transform duration-200 group-open:rotate-180"
                        />
                      </summary>

                      <p className="mt-3 px-2 text-sm leading-6 text-neutral-textSecondary">
                        {item.answer}
                      </p>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
