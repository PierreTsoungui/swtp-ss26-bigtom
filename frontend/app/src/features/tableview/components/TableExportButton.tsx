/**
 * Props for the TableExportButton component.
 */
type Props = {
  /** Callback triggered to initiate the data export (e.g., CSV generation). */
  onDownload: () => void;
};

/**
 * A styled button component used to trigger table data downloads.
 *
 * Typically used in results views to export filtered analysis data
 * into a machine-readable CSV format.
 */
export function TableExportButton({
  onDownload,
}: Props) {
  return (
    <button
      onClick={onDownload}
      className="rounded border-2 border-primary bg-neutral-card px-4 py-2.5 text-sm font-semibold leading-5 text-primary transition-colors hover:bg-primary hover:text-primary-text"
    >
      Download CSV
    </button>
  );
}
