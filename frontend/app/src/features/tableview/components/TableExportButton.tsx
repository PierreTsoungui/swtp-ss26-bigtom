type Props = {
  onDownload: () => void;
};
export function TableExportButton({ onDownload, }: Props) {
  return (
    <button
      onClick={onDownload}
      className="text-blue-600 bg-gray-100 border border-blue-600 hover:bg-blue-600 hover:text-white focus:ring-4 focus:ring-blue-200 font-medium leading-5 rounded text-sm px-4 py-2.5 focus:outline-none"
    >
      Download CSV
    </button>
  );
}
