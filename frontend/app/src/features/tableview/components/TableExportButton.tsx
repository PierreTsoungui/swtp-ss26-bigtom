type Props = {
  onDownload: () => void;
};
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
