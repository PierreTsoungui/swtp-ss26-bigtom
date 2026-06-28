import { useState } from "react";

import PlotFigure from "./PlotFigure";
import PlotLightbox from "./PlotLightbox";
import PlotExportButtons from "./PlotExportButtons";
import type { PlotSource } from "./types";

interface PlotViewProps {
    /** The plot to display and export. */
    source: PlotSource;
    /** Tailwind max-height class for the inline preview. @default "max-h-72" */
    maxHeightClass?: string;
    /** Size of the inline export buttons. @default "medium" */
    exportSize?: "small" | "medium";
    /** Called when an export download fails. */
    onExportError?: (error: unknown) => void;
    /** Extra classes for the wrapper. */
    className?: string;
}

/**
 * Drop-in display for one static plot: an inline preview that enlarges on click
 * plus the consistent PNG/PDF export controls. Manages its own lightbox state.
 *
 * This is the single component features should reach for — it guarantees that
 * every static plot looks, hovers, zooms and exports identically.
 */
function PlotView({
    source,
    maxHeightClass,
    exportSize = "medium",
    onExportError,
    className = "",
}: PlotViewProps) {
    const [isEnlarged, setIsEnlarged] = useState(false);

    return (
        <div className={`space-y-3 ${className}`}>
            <PlotFigure
                source={source}
                onEnlarge={() => setIsEnlarged(true)}
                maxHeightClass={maxHeightClass}
            />
            <div className="flex justify-end">
                <PlotExportButtons source={source} size={exportSize} onError={onExportError} />
            </div>

            {isEnlarged && (
                <PlotLightbox
                    source={source}
                    onClose={() => setIsEnlarged(false)}
                    onExportError={onExportError}
                />
            )}
        </div>
    );
}

export default PlotView;
