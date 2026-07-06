import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { Button } from "./Button";

/**
 * Props for the {@link Modal} primitive.
 */
export interface ModalProps {
  /** Called when the user dismisses the modal (backdrop, Escape, or close button). */
  onClose: () => void;
  /** The modal's panel content. */
  children: ReactNode;
  /** Utility classes for the panel container (sizing, layout, overflow). */
  className?: string;
  /** Extra classes for the backdrop overlay (e.g. `backdrop-blur-sm`). */
  backdropClassName?: string;
  /** `id` of the element that titles the dialog (sets `aria-labelledby`). */
  labelledBy?: string;
  /** `id` of the element that describes the dialog (sets `aria-describedby`). */
  describedBy?: string;
  /** Accessible name used when there is no visible title element. */
  ariaLabel?: string;
  /**
   * Whether the modal may be dismissed via the backdrop or Escape. Set to
   * `false` to block dismissal during an in-flight action. @default true
   */
  dismissible?: boolean;
  /** Whether to render the built-in "✕" close button. @default true */
  showCloseButton?: boolean;
  /** Accessible label for the built-in close button. @default "Close" */
  closeLabel?: string;
  /**
   * Element to focus when the modal opens. Defaults to the built-in close
   * button, or the panel itself when no close button is shown.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Element to focus when the modal closes. Defaults to whatever was focused
   * before it opened; provide this to guarantee focus returns to the trigger.
   */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

/** Selector matching the tab-focusable descendants inside the panel. */
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Accessible, self-contained modal dialog primitive.
 *
 * It centralizes everything a modal must get right — a backdrop that closes on
 * outside click, Escape-to-close, a Tab focus-trap, body scroll-lock, focus
 * restoration to the previously focused element on close, and the correct
 * `role="dialog"`/`aria-modal` semantics — so features never re-implement (and
 * subtly diverge on) this behavior. Callers provide only the panel content and
 * layout classes.
 *
 * @remarks
 * `onClose` is read through a ref, so the open/close lifecycle (scroll-lock,
 * listeners, initial focus) runs exactly once per mount even if the callback
 * identity changes between renders.
 */
export function Modal({
  onClose,
  children,
  className,
  backdropClassName,
  labelledBy,
  describedBy,
  ariaLabel,
  dismissible = true,
  showCloseButton = true,
  closeLabel = "Close",
  initialFocusRef,
  restoreFocusRef,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Keep the latest onClose/dismissible without re-running the lifecycle effect.
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  }, [onClose, dismissible]);

  useEffect(() => {
    // Capture the focus-restore target now (on open): the explicit ref if given,
    // else whatever was focused before. Both are stable for the modal's lifetime.
    const restoreTarget =
      restoreFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the requested element, then the close button, then the panel.
    (initialFocusRef?.current ?? closeButtonRef.current ?? panelRef.current)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (dismissibleRef.current) {
          event.preventDefault();
          onCloseRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) {
        return;
      }

      const focusables = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      restoreTarget?.focus();
    };
    // Runs once per open: refs stay stable and onClose is read via onCloseRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-neutral-textPrimary/70 p-4 ${backdropClassName ?? ""}`}
      onMouseDown={dismissible ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={ariaLabel}
        tabIndex={-1}
        className={`relative rounded-xl bg-neutral-card shadow-2xl outline-none ${className ?? ""}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {showCloseButton && (
          <Button
            ref={closeButtonRef}
            variant="secondary"
            size="icon"
            onClick={onClose}
            aria-label={closeLabel}
            className="absolute right-3 top-3 z-10"
          >
            ✕
          </Button>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
