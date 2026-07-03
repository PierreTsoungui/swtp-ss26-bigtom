import { useEffect, useId, useRef } from "react";

import PlotExportButtons from "./PlotExportButtons";
import type { PlotSource } from "./types";

interface PlotLightboxProps {
    /** The plot to display enlarged. */
    source: PlotSource;
    /** Closes the lightbox. */
    onClose: () => void;
    /** Forwarded from the export buttons so the host can surface errors. */
    onExportError?: (error: unknown) => void;
}

/**
 * Consistent enlarged ("lightbox") view for any static plot: a focus-trapped,
 * Escape-dismissable modal showing the figure at full size with the same export
 * controls and the same close affordance everywhere in the app.
 */
function PlotLightbox({ source, onClose, onExportError }: PlotLightboxProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const titleId = useId();

    useEffect(() => {
        const previousActive = document.activeElement as HTMLElement | null;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
            previousActive?.focus();
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-textPrimary/70 p-4 backdrop-blur-sm"
            onMouseDown={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex max-h-[92vh] max-w-[95vw] flex-col overflow-hidden rounded-xl bg-neutral-card shadow-2xl"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-4 border-b border-neutral-borderDefault px-4 py-3">
                    <h2 id={titleId} className="text-base font-semibold text-neutral-textPrimary">
                        {source.title}
                    </h2>
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-surface text-lg font-bold text-neutral-textSecondary transition-colors hover:bg-neutral-borderDefault focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                        ✕
                    </button>
                </div>

                <div className="overflow-auto p-4">
                    <img
                        src={source.pngUrl}
                        alt={source.title}
                        className="mx-auto block h-auto max-h-[75vh] max-w-full object-contain"
                    />
                </div>

                <div className="flex justify-end border-t border-neutral-borderDefault px-4 py-3">
                    <PlotExportButtons source={source} onError={onExportError} />
                </div>
            </div>
        </div>
    );
}

export default PlotLightbox;
