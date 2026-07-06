/**
 * The minimal shape a sample-sheet preview must have to be rendered. Both the
 * upload and batch preview payloads structurally satisfy this.
 */
export interface SampleSheetPreviewData {
  /** Column headers. */
  columns: string[];
  /** Row values, aligned to {@link SampleSheetPreviewData.columns}. */
  rows: string[][];
  /** Total number of samples in the full sheet. */
  total_rows: number;
  /** Whether `rows` is a truncated view of the full sheet. */
  truncated: boolean;
}

/**
 * Props for {@link SampleSheetPreviewTable}.
 */
export interface SampleSheetPreviewTableProps {
  /** The tabular preview, or `null` while it is still loading. */
  preview: SampleSheetPreviewData | null;
  /** Error message to show instead of the table, if loading failed. */
  error?: string | null;
}

/**
 * Read-only tabular preview of a sample sheet, with loading and error states.
 *
 * Shared by the upload and batch sample-sheet preview modals, which previously
 * duplicated this markup almost verbatim. It renders the header row, all data
 * rows, and a truncation-aware sample count.
 */
export function SampleSheetPreviewTable({ preview, error }: SampleSheetPreviewTableProps) {
  if (error) {
    return <p className="text-danger">{error}</p>;
  }
  if (!preview) {
    return <p className="text-neutral-textSecondary">Loading…</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-neutral-borderDefault">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-neutral-surface">
            <tr>
              {preview.columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-3 py-2 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-neutral-borderDefault">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="whitespace-nowrap px-3 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-textSecondary">
        {preview.total_rows} samples
        {preview.truncated ? ` (showing first ${preview.rows.length})` : ""}
      </p>
    </>
  );
}

export default SampleSheetPreviewTable;
