import { ZoomIn } from "@mui/icons-material";

import type { PlotSource } from "./types";

interface PlotFigureProps {
    /** The plot to display. */
    source: PlotSource;
    /** Opens the enlarged view (lightbox). */
    onEnlarge: () => void;
    /** Tailwind max-height class for the inline preview. @default "max-h-72" */
    maxHeightClass?: string;
    /** Extra classes for the figure wrapper. */
    className?: string;
}

/**
 * Consistent inline preview for a static plot: a bordered, neutral-background
 * thumbnail that shows a "zoom" affordance on hover and opens the
 * {@link PlotLightbox} when clicked. Rendered as a button so it is keyboard
 * accessible.
 */
function PlotFigure({
    source,
    onEnlarge,
    maxHeightClass = "max-h-72",
    className = "",
}: PlotFigureProps) {
    return (
        <button
            type="button"
            onClick={onEnlarge}
            aria-label={`Enlarge ${source.title}`}
            className={`group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-neutral-borderDefault bg-neutral-surface transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${className}`}
        >
            <img
                src={source.pngUrl}
                alt={source.title}
                className={`mx-auto block w-full object-contain ${maxHeightClass}`}
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-textPrimary/0 transition-colors group-hover:bg-neutral-textPrimary/20">
                <span className="flex items-center gap-1 rounded-full bg-neutral-card px-3 py-1.5 text-sm font-medium text-neutral-textPrimary opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                    <ZoomIn fontSize="small" />
                    Enlarge
                </span>
            </span>
        </button>
    );
}

export default PlotFigure;
