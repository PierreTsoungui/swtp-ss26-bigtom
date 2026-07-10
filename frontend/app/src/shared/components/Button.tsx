import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { buttonClasses } from "./buttonStyles";
import type { ButtonSize, ButtonVariant } from "./buttonStyles";

export type { ButtonSize, ButtonVariant } from "./buttonStyles";

/**
 * Props for {@link Button}.
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * The single, canonical button of the application.
 *
 * Using this component guarantees that every button shares the same border,
 * radius, hover reaction, focus ring and disabled state; only the semantic
 * colour (via `variant`) changes. This is the single source of truth that keeps
 * buttons consistent and prevents styling drift. Non-`<button>` elements that
 * must look identical (e.g. a routing `<Link>`) reuse {@link buttonClasses}.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", type = "button", className = "", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={buttonClasses(variant, size, className)} {...props} />
  );
});

export default Button;
