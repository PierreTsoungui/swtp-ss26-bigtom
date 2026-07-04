import { useCallback, useEffect, useId, useRef, useState } from "react";
import HelpContent from "./HelpContent";
import { helpTopics, type HelpTopicId } from "./registry";

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
 */
function HelpButton({ topic, ariaLabel = "Open help" }: HelpButtonProps) {
    const { title, body } = helpTopics[topic];

    const [open, setOpen] = useState(false);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    const titleId = useId();
    const descriptionId = useId();

    const closeDialog = useCallback(() => {
        setOpen(false);
    }, []);

    useEffect(() => {
        if (!open) {
            return;
        }

        const triggerElement = triggerRef.current;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeDialog();
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) {
                return;
            }

            const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
                [
                    "button:not([disabled])",
                    "[href]",
                    "input:not([disabled])",
                    "select:not([disabled])",
                    "textarea:not([disabled])",
                    '[tabindex]:not([tabindex="-1"])',
                ].join(","),
            );

            if (focusableElements.length === 0) {
                event.preventDefault();
                return;
            }

            const firstElement = focusableElements[0];
            const lastElement = focusableElements[focusableElements.length - 1];

            if (event.shiftKey && document.activeElement === firstElement) {
                event.preventDefault();
                lastElement.focus();
            }

            if (!event.shiftKey && document.activeElement === lastElement) {
                event.preventDefault();
                firstElement.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
            triggerElement?.focus();
        };
    }, [closeDialog, open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(true)}
                className="group inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold text-neutral-textSecondary transition hover:bg-neutral-surface active:bg-info-badgeBackground"
                aria-label={ariaLabel}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <span
                    aria-hidden="true"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-borderEmphasis bg-neutral-card transition group-hover:border-primary group-hover:text-primary group-active:border-primary"
                >
                    ?
                </span>
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-textPrimary/60 p-4"
                    onMouseDown={closeDialog}
                >
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={descriptionId}
                        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-neutral-borderDefault bg-neutral-card text-neutral-textPrimary shadow-2xl"
                        onMouseDown={(event) => event.stopPropagation()}
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

                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={closeDialog}
                                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-textSecondary bg-neutral-card text-xl font-semibold leading-none text-neutral-textPrimary transition-colors hover:bg-neutral-surface"
                                aria-label="Close help"
                            >
                                ×
                            </button>
                        </div>

                        <div id={descriptionId} className="overflow-y-auto px-6 py-5">
                            <HelpContent markdown={body} />
                        </div>

                        <div className="flex justify-end border-t border-neutral-borderDefault px-6 py-4">
                            <button
                                type="button"
                                onClick={closeDialog}
                                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-text shadow-sm transition-colors hover:bg-primary-hover"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default HelpButton;
