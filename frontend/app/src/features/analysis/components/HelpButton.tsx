import { useCallback, useEffect, useId, useRef, useState } from "react";
/**
 * Props für den HelpButton.
 */
interface HelpButtonProps {
    /**
     * Der Text, der im Dialog angezeigt wird.
     */
    helpText: string;

    /**
     * Optionales ARIA-Label für den Button.
     * @default "Hilfe öffnen"
     */
    ariaLabel?: string;

    /**
     * Optionaler Titel für den Dialog.
     * @default "Hilfe"
     */
    dialogTitle?: string;
}

function HelpButton({
                        helpText,
                        ariaLabel = "Hilfe öffnen",
                        dialogTitle = "Hilfe",
                    }: HelpButtonProps) {
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
            triggerRef.current?.focus();
        };
    }, [closeDialog, open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-sm font-bold text-zinc-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-zinc-100 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                aria-label={ariaLabel}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                ?
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
                    onMouseDown={closeDialog}
                >
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={descriptionId}
                        className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-900 shadow-2xl"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-6 py-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                                    Kontextuelle Hilfe
                                </p>
                                <h2 id={titleId} className="mt-1 text-xl font-semibold">
                                    {dialogTitle}
                                </h2>
                            </div>

                            <button
                                ref={closeButtonRef}
                                type="button"
                                onClick={closeDialog}
                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-xl font-semibold leading-none text-zinc-700 transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                                aria-label="Hilfe schließen"
                            >
                                ×
                            </button>
                        </div>

                        <div className="overflow-y-auto px-6 py-5">
                            <p
                                id={descriptionId}
                                className="whitespace-pre-line text-sm leading-7 text-zinc-700"
                            >
                                {helpText}
                            </p>
                        </div>

                        <div className="flex justify-end border-t border-zinc-200 px-6 py-4">
                            <button
                                type="button"
                                onClick={closeDialog}
                                className="rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-zinc-50 shadow-sm transition hover:bg-indigo-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default HelpButton;