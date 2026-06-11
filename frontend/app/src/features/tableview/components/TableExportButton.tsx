type Props = {
  onDownload: () => void;
};
export function TableExportButton({
  onDownload,
}: Props) {
  return (
    <button
      onClick={onDownload}
      className="border px-4 py-2 rounded"
    >
      Download CSV
    </button>
  );
}