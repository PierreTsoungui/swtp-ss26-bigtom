import type { MethodPreview } from "../types";
import { METHOD_ORDER } from "../types";

/**
 * Sorts method previews into the canonical display order.
 *
 * Methods are ordered according to {@link METHOD_ORDER} (so `raw` is always the
 * left-most baseline). Any method not present in that list is placed after all
 * known methods, preserving a deterministic layout even if the backend adds a
 * method the frontend does not yet rank.
 *
 * @param methods - The method previews to order (not mutated).
 * @returns A new array sorted by canonical order.
 */
export function orderMethods(methods: MethodPreview[]): MethodPreview[] {
  const rank = (method: MethodPreview) => METHOD_ORDER.indexOf(method.method) + 1 || 99;
  return [...methods].sort((a, b) => rank(a) - rank(b));
}
