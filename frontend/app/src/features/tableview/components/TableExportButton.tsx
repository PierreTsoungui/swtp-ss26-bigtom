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
      className="text-blue-600 bg-gray-100 border border-blue-600 hover:bg-blue-600 hover:text-white focus:ring-4 focus:ring-blue-200 font-medium leading-5 rounded text-sm px-4 py-2.5 focus:outline-none"
    >
      Download CSV
    </button>
  );
}
