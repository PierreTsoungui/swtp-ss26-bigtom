import { useEffect, useState } from "react";
import type { SampleSheetPreview } from "../utils/types";

interface Props {
  jobId: string;
  onClose: () => void;
}

/**
 * Read-only preview of the job's sample sheet. Because a column carrying the
 * biological group can have ANY name, the biologist uses this table to identify
 * which column to protect and which to remove.
 */
function SampleSheetPreviewModal({ jobId, onClose }: Props) {
  const [preview, setPreview] = useState<SampleSheetPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/v1/batch/${jobId}/sample-sheet`)
      .then((r) => {
        if (!r.ok) throw new Error(`Error ${r.status}`);
        return r.json();
      })
      .then((d: SampleSheetPreview) => active && setPreview(d))
      .catch((e: unknown) => active && setError(e instanceof Error ? e.message : "Preview failed"));
    return () => {
      active = false;
    };
  }, [jobId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-textPrimary/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-4xl overflow-auto rounded-xl bg-neutral-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-surface text-lg font-bold hover:bg-neutral-borderDefault"
        >
          ✕
        </button>
        <h3 className="mb-3 text-lg font-semibold text-neutral-textPrimary">Sample sheet</h3>

        {error && <p className="text-danger">{error}</p>}
        {!error && !preview && <p className="text-neutral-textSecondary">Loading…</p>}

        {preview && (
          <>
            <div className="overflow-x-auto rounded-md border border-neutral-borderDefault">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-surface">
                  <tr>
                    {preview.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, i) => (
                    <tr key={i} className="border-t border-neutral-borderDefault">
                      {row.map((cell, j) => (
                        <td key={j} className="whitespace-nowrap px-3 py-1.5">
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
        )}
      </div>
    </div>
  );
}

export default SampleSheetPreviewModal;
