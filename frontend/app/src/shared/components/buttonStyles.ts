/**
 * Styling logic for the shared {@link Button}. Kept in a separate module so
 * non-`<button>` elements that must look like a button (e.g. a routing `<Link>`)
 * can reuse the exact same classes, and so the component file only exports a
 * component (which keeps React Fast Refresh working).
 *
 * **Button policy (§14).** The shared {@link Button} is the single button system
 * for every standard action across the app. Material UI is used only for its
 * rich interactive widgets (Accordion, Select, Switch, TextField, Snackbar, …),
 * never for plain buttons — this keeps button styling consistent and centralized.
 */

/**
 * Semantic colour of a button. The colour conveys intent; every variant shares
 * the same shape, border, hover behaviour, focus ring and disabled treatment,
 * so buttons stay visually consistent regardless of colour.
 *
 *  - `primary`   filled brand colour for the main action.
 *  - `secondary` neutral outline for secondary/cancel/back actions.
 *  - `danger`    filled red for destructive actions.
 */
export type ButtonVariant = "primary" | "secondary" | "danger";

/**
 * Size of a button.
 *
 *  - `sm`   compact button for dense contexts (e.g. inline plot controls).
 *  - `md`   default text button.
 *  - `lg`   prominent call-to-action.
 *  - `icon` square icon-only button (e.g. a close "×").
 */
export type ButtonSize = "sm" | "md" | "lg" | "icon";

// Shared by every button: consistent shape (rounded-md), a 1px border, the same
// colour transition, a single focus ring and a single disabled treatment.
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md border font-semibold " +
  "transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 " +
  "focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-8 py-3 text-base",
  icon: "h-9 w-9 text-lg leading-none",
};

// Every variant defines the same set of properties (border colour, background,
// text colour, and the hover response), so the hover reaction is uniform: filled
// variants darken, the outline variant fills subtly. Only the colour differs.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-primary bg-primary text-primary-text hover:border-primary-hover hover:bg-primary-hover",
  secondary:
    "border-neutral-borderEmphasis bg-neutral-card text-neutral-textSecondary hover:bg-neutral-surface hover:text-neutral-textPrimary",
  danger:
    "border-danger bg-danger text-danger-text hover:border-danger-hover hover:bg-danger-hover",
};

/**
 * Compose the class string for a button.
 *
 * @param variant Semantic colour (default `primary`).
 * @param size    Size (default `md`).
 * @param extra   Additional utility classes appended verbatim (e.g. `w-full`).
 */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return `${BASE} ${SIZES[size]} ${VARIANTS[variant]} ${extra}`.trim();
}
