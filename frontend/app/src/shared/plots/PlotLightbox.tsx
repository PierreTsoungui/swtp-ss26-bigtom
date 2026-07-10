import { useId, useRef } from "react";

import PlotExportButtons from "./PlotExportButtons";
import { Button } from "../components/Button";
import { Modal } from "../components/Modal";
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
 * Consistent enlarged ("lightbox") view for any static plot: the figure at full
 * size with the same export controls and close affordance everywhere in the app.
 *
 * The modal behavior (backdrop, Escape, focus-trap, scroll-lock, focus
 * restoration) is provided by the shared {@link Modal}; this component supplies
 * only the header, figure, and export footer.
 */
function PlotLightbox({ source, onClose, onExportError }: PlotLightboxProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  return (
    <Modal
      onClose={onClose}
      backdropClassName="backdrop-blur-sm"
      className="flex max-h-[92vh] max-w-[95vw] flex-col overflow-hidden"
      labelledBy={titleId}
      showCloseButton={false}
      initialFocusRef={closeButtonRef}
    >
      <div className="flex items-center justify-between gap-4 border-b border-neutral-borderDefault px-4 py-3">
        <h2 id={titleId} className="text-base font-semibold text-neutral-textPrimary">
          {source.title}
        </h2>
        <Button
          ref={closeButtonRef}
          variant="secondary"
          size="icon"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0"
        >
          ✕
        </Button>
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
    </Modal>
  );
}

export default PlotLightbox;
