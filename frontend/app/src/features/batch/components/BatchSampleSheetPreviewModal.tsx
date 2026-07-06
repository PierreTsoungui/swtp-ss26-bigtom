import type { SampleSheetPreview } from "../types";
import { previewSampleSheet } from "../hooks/batchApi";
import { Modal } from "../../../shared/components/Modal";
import { SampleSheetPreviewTable } from "../../../shared/components/SampleSheetPreviewTable";
import { useAsyncResource } from "../../../shared/hooks/useAsyncResource";

/**
 * Props for the BatchSampleSheetPreviewModal component.
 */
interface Props {
  /** Unique identifier for the analysis job. */
  jobId: string;
  /** Callback to close the modal. */
  onClose: () => void;
}

/**
 * A read-only tabular preview of the job's sample sheet.
 *
 * This table helps users identify which metadata columns to protect (biological
 * signal) and which to remove (technical batch effects) during correction. Data
 * loading and the modal chrome are delegated to the shared building blocks.
 */
function BatchSampleSheetPreviewModal({ jobId, onClose }: Props) {
  const { data: preview, error } = useAsyncResource<SampleSheetPreview>(
    (signal) => previewSampleSheet(jobId, signal),
    [jobId],
  );

  return (
    <Modal
      onClose={onClose}
      backdropClassName="backdrop-blur-sm"
      className="max-h-[85vh] w-full max-w-4xl overflow-auto p-5"
    >
      <h3 className="mb-3 text-lg font-semibold text-neutral-textPrimary">Sample sheet</h3>
      <SampleSheetPreviewTable preview={preview} error={error} />
    </Modal>
  );
}

export default BatchSampleSheetPreviewModal;
