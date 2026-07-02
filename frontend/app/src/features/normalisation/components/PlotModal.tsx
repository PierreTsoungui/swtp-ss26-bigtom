/**
 * Props for the PlotModal component.
 */
interface PlotModalProps {
    /** The source URL of the image to be displayed. */
    imageURL: string;
    /** Descriptive title for the image, also used as alternative text. */
    title: string;
    /** Callback fired when the modal requests to be closed (via backdrop click or close button). */
    onClose: () => void;
}

/**
 * A modal lightbox for inspecting analysis plots in high detail.
 *
 * It features a backdrop blur effect and ensures the plot remains within
 * the viewport boundaries. Clicks on the backdrop are intercepted to
 * facilitate easy closing.
 */
function PlotModal({imageURL, title, onClose}: PlotModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-textPrimary/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative max-h-[90vh] max-w-[90vw] bg-neutral-card rounded-xl shadow-2xl p-4"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-neutral-card shadow-md hover:bg-neutral-surface flex items-center justify-center text-lg font-bold"
                >
                    ✕
                </button>
                <img
                    src={imageURL}
                    alt={title}
                    className="max-h-[85vh] w-auto rounded-md"
                />
                <p className="mt-2 text-center text-sm text-neutral-textSecondary">{title}</p>
            </div>
        </div>
    );
}

export default PlotModal;
