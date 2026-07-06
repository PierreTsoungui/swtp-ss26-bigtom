import { useId, useRef, useState } from "react";
import HelpContent from "./HelpContent";
import { helpTopics, type HelpTopicId } from "./registry";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";

/**
 * Props for the {@link HelpButton}.
 */
interface HelpButtonProps {
  /**
   * Id of the help topic to display. Title and Markdown body are resolved from
   * the central {@link helpTopics} registry.
   */
  topic: HelpTopicId;

  /**
   * Optional ARIA label for the trigger button.
   * @default "Open help"
   */
  ariaLabel?: string;
}

/**
 * A small "?" button that opens an accessible modal dialog with contextual,
 * Markdown-formatted help for the given {@link HelpButtonProps.topic}.
 *
 * The dialog's behavior (backdrop, Escape, focus-trap, scroll-lock, and focus
 * restoration to this trigger) is provided by the shared {@link Modal}.
 */
function HelpButton({ topic, ariaLabel = "Open help" }: HelpButtonProps) {
  const { title, body } = helpTopics[topic];

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const titleId = useId();
  const descriptionId = useId();

  return (
    <>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden="true" className="font-bold">
          ?
        </span>
      </Button>

      {open && (
        <Modal
          onClose={() => setOpen(false)}
          labelledBy={titleId}
          describedBy={descriptionId}
          showCloseButton={false}
          initialFocusRef={closeButtonRef}
          restoreFocusRef={triggerRef}
          className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden border border-neutral-borderDefault text-neutral-textPrimary"
        >
          <div className="flex items-start justify-between gap-4 border-b border-neutral-borderDefault px-6 py-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">
                Contextual Help
              </p>
              <h2 id={titleId} className="mt-1 text-xl font-semibold">
                {title}
              </h2>
            </div>
          </div>

          <div id={descriptionId} className="overflow-y-auto px-6 py-5">
            <HelpContent markdown={body} />
          </div>

          <div className="flex justify-end border-t border-neutral-borderDefault px-6 py-4">
            <Button
              ref={closeButtonRef}
              variant="primary"
              onClick={() => setOpen(false)}
              aria-label="Close help"
            >
              Close
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}

export default HelpButton;
