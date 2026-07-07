import { previewSheet } from "../hooks/uploadApi";
import type { SheetPreview } from "../types";
import { Modal } from "@shared/components/Modal.tsx";
import { SampleSheetPreviewTable } from "@shared/components/SampleSheetPreviewTable.tsx";
import { useAsyncResource } from "@shared/hooks/useAsyncResource.ts";

/**
 * Props for the UploadSampleSheetPreviewModal component.
 */
interface Props {
  /** The current staging session ID. */
  sessionId: string;
  /** The unique identifier of the sample sheet to preview. */
  sheetId: string;
  /** The filename or display name of the sheet. */
  sheetName: string;
  /** Callback to close the modal. */
  onClose: () => void;
}

/**
 * An overlay component that displays a tabular preview of a sample sheet's content.
 *
 * It fetches the preview on demand and handles large files by showing a
 * truncated view. Data loading and the modal chrome are delegated to the shared
 * building blocks.
 */
function UploadSampleSheetPreviewModal({ sessionId, sheetId, sheetName, onClose }: Props) {
  const { data: preview, error } = useAsyncResource<SheetPreview>(
    () => previewSheet(sessionId, sheetId),
    [sessionId, sheetId],
    { mapError: (e) => (e instanceof Error ? e.message : "Preview failed") },
  );

  return (
    <Modal
      onClose={onClose}
      backdropClassName="backdrop-blur-sm"
      className="max-h-[85vh] w-full max-w-4xl overflow-auto p-5"
    >
      <h3 className="mb-3 text-lg font-semibold text-neutral-textPrimary">Preview · {sheetName}</h3>
      <SampleSheetPreviewTable preview={preview} error={error} />
    </Modal>
  );
}

export default UploadSampleSheetPreviewModal;
