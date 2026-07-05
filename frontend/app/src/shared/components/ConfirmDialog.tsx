import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Props for {@link ConfirmDialog}.
 */
interface ConfirmDialogProps {
  /** Whether the dialog is visible. When false, nothing is rendered. */
  open: boolean;
  /** Short, action-oriented heading (e.g. "Delete this analysis?"). */
  title: string;
  /** Body content explaining the consequences of confirming. */
  description: ReactNode;
  /** Label of the confirming button (default "Confirm"). */
  confirmLabel?: string;
  /** Label of the dismissing button (default "Cancel"). */
  cancelLabel?: string;
  /** Invoked when the user confirms the action. */
  onConfirm: () => void;
  /** Invoked when the user dismisses (button, backdrop, or Escape). */
  onCancel: () => void;
  /** Styles the confirm button as destructive (red) when true. */
  destructive?: boolean;
  /**
   * When true the action is in progress: both buttons are disabled and
   * dismissal (backdrop/Escape/Cancel) is blocked so the user cannot abandon an
   * in-flight operation. The confirm button shows {@link busyLabel}.
   */
  busy?: boolean;
  /** Label shown on the confirm button while {@link busy} (default "Working…"). */
  busyLabel?: string;
}

/**
 * An accessible, reusable confirmation dialog for consequential actions.
 *
 * It implements the interaction contract expected of a modal dialog:
 * `role="dialog"` + `aria-modal`, a labelled title and description, focus moved
 * to the safe (Cancel) button on open and restored to the trigger on close, a
 * focus trap that keeps Tab within the dialog, and Escape/backdrop dismissal.
 * While {@link busy} it becomes non-dismissible so a running action cannot be
 * interrupted halfway.
 *
 * The component is presentation-only: it performs no side effects itself and
 * leaves the actual work (and any resulting navigation) to {@link onConfirm}.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  destructive = false,
  busy = false,
  busyLabel = "Working…",
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Focus management, Escape handling and a focus trap, active only while open.
  useEffect(() => {
    if (!open) return;

    // Remember the element that opened the dialog so focus can be restored.
    triggerRef.current = document.activeElement as HTMLElement | null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!busy) {
          event.preventDefault();
          onCancel();
        }
        return;
      }
      if (event.key !== "Tab") return;

      // Keep Tab focus within the dialog.
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      // Restore focus to whatever opened the dialog for a seamless return.
      triggerRef.current?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  const titleId = "confirm-dialog-title";
  const descriptionId = "confirm-dialog-description";

  const confirmClasses = destructive
    ? "bg-danger text-danger-text hover:bg-danger-hover"
    : "bg-primary text-primary-text hover:bg-primary-hover";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-neutral-textPrimary/70 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-neutral-card p-6 shadow-2xl"
      >
        <h2 id={titleId} className="text-lg font-semibold text-neutral-textPrimary">
          {title}
        </h2>
        <div id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-textSecondary">
          {description}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-neutral-borderEmphasis px-4 py-2 text-sm font-semibold text-neutral-textSecondary transition-colors hover:bg-neutral-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 ${confirmClasses}`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
