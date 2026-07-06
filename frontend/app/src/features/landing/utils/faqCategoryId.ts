/**
 * Derives a stable, DOM-safe anchor id for a FAQ category heading.
 *
 * Used to link each FAQ category's `<section aria-labelledby>` to its `<h3 id>`,
 * so the grouping is exposed to assistive technology.
 *
 * @param title - The category title (e.g. "Upload & Files").
 * @returns A slug suitable for use as an element `id` (e.g. `faq-upload-&-files`).
 */
export function faqCategoryId(title: string): string {
  return `faq-${title.replaceAll(" ", "-").toLowerCase()}`;
}
