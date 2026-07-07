import { Button } from "@shared/components/Button.tsx";

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
export function TableExportButton({ onDownload }: Props) {
  return (
    <Button variant="secondary" onClick={onDownload}>
      Download CSV
    </Button>
  );
}
