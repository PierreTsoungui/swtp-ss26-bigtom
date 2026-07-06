import { useRef } from "react";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Modal } from "./Modal";

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

const TITLE_ID = "confirm-dialog-title";
const DESCRIPTION_ID = "confirm-dialog-description";

/**
 * An accessible, reusable confirmation dialog for consequential actions.
 *
 * Built on the shared {@link Modal}, so it inherits the correct dialog
 * semantics, focus management, focus-trap and scroll-lock. Focus opens on the
 * safe (Cancel) button. While {@link busy} the dialog becomes non-dismissible so
 * a running action cannot be interrupted halfway.
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
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  if (!open) return null;

  return (
    <Modal
      onClose={onCancel}
      dismissible={!busy}
      showCloseButton={false}
      initialFocusRef={cancelButtonRef}
      labelledBy={TITLE_ID}
      describedBy={DESCRIPTION_ID}
      backdropClassName="backdrop-blur-sm"
      className="w-full max-w-md p-6"
    >
      <h2 id={TITLE_ID} className="text-lg font-semibold text-neutral-textPrimary">
        {title}
      </h2>
      <div id={DESCRIPTION_ID} className="mt-2 text-sm leading-6 text-neutral-textSecondary">
        {description}
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button ref={cancelButtonRef} variant="secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export default ConfirmDialog;
