import {
  formatBytes,
  type IdatPair,
  type OtherFile,
  type RoleKey,
  type SampleSheetCandidate,
} from "../utils/uploadApi";
import ColumnRoleMapper, { type RoleSelection } from "./ColumnRoleMapper";

interface Props {
  sheets: SampleSheetCandidate[];
  pairs: IdatPair[];
  otherFiles: OtherFile[];
  selectedSheetId: string | null;
  blockingError: string | null;
  selectionHint: string | null;
  mappingColumns: string[];
  columnMapping: RoleSelection;
  onSetRole: (role: RoleKey, value: string | null) => void;
  onSelectSheet: (id: string) => void;
  onPreviewSheet: (sheet: SampleSheetCandidate) => void;
  onRemovePair: (pairId: string) => void;
  disabled?: boolean;
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-danger hover:bg-danger-badgeBackground"
    >
      ✕
    </button>
  );
}

/** Reviewable, editable list of everything the backend detected. */
function FileReviewList({
  sheets,
  pairs,
  otherFiles,
  selectedSheetId,
  blockingError,
  selectionHint,
  mappingColumns,
  columnMapping,
  onSetRole,
  onSelectSheet,
  onPreviewSheet,
  onRemovePair,
  disabled = false,
}: Props) {
  const completeCount = pairs.filter((p) => p.complete).length;

  return (
    <div className="space-y-6">
      {/* Sample sheets — pick exactly one (radio) */}
      <section>
        <h3 className="mb-2 font-semibold text-neutral-textPrimary">
          Sample sheet <span className="text-danger">*</span>
        </h3>
        {blockingError && (
          <div className="mb-3 rounded-md border border-danger bg-danger-badgeBackground px-3 py-2 text-sm text-danger-badgeText">
            {blockingError}
          </div>
        )}
        {selectionHint && (
          <div className="mb-3 rounded-md border border-warning bg-warning-badgeBackground px-3 py-2 text-sm text-warning-badgeText">
            {selectionHint}
          </div>
        )}
        <ul className="space-y-2">
          {sheets.map((sheet) => (
            <li
              key={sheet.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                selectedSheetId === sheet.id
                  ? "border-primary bg-info-badgeBackground"
                  : "border-neutral-borderDefault bg-neutral-card"
              }`}
            >
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="sample-sheet"
                  checked={selectedSheetId === sheet.id}
                  onChange={() => onSelectSheet(sheet.id)}
                  className="h-4 w-4"
                />
                <span className="truncate font-medium" title={sheet.rel_path}>
                  {sheet.name}
                </span>
                {sheet.sample_count !== null && (
                  <span className="shrink-0 text-xs text-neutral-textSecondary">
                    {sheet.sample_count} samples
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => onPreviewSheet(sheet)}
                className="text-sm font-semibold text-primary hover:underline"
              >
                Preview
              </button>
            </li>
          ))}
          {sheets.length === 0 && (
            <li className="text-sm text-neutral-textSecondary">No sample sheet detected.</li>
          )}
        </ul>

        {/* Role mapping for the chosen sheet — required before starting. */}
        {selectedSheetId && mappingColumns.length > 0 && (
          <div className="mt-4 rounded-lg border border-neutral-borderDefault bg-neutral-surface p-4">
            <ColumnRoleMapper
              columns={mappingColumns}
              mapping={columnMapping}
              onChange={onSetRole}
              disabled={disabled}
            />
          </div>
        )}
      </section>

      {/* IDAT pairs */}
      <section>
        <h3 className="mb-2 font-semibold text-neutral-textPrimary">
          IDAT samples{" "}
          <span className="text-sm font-normal text-neutral-textSecondary">
            ({completeCount} complete)
          </span>
        </h3>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {pairs.map((pair) => (
            <li
              key={pair.pair_id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                pair.complete
                  ? "border-neutral-borderDefault bg-neutral-card"
                  : "border-warning bg-warning-badgeBackground"
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-medium" title={pair.pair_id}>
                  {pair.pair_id}
                </p>
                <p className="text-xs text-neutral-textSecondary">
                  {pair.complete
                    ? `Grn + Red · ${formatBytes((pair.grn?.size_bytes ?? 0) + (pair.red?.size_bytes ?? 0))}`
                    : `Incomplete — missing ${pair.grn ? "Red" : "Grn"}`}
                </p>
              </div>
              <RemoveButton onClick={() => onRemovePair(pair.pair_id)} label={`Remove ${pair.pair_id}`} />
            </li>
          ))}
          {pairs.length === 0 && (
            <li className="text-sm text-neutral-textSecondary">No IDAT files detected.</li>
          )}
        </ul>
      </section>

      {/* Other / ignored files */}
      {otherFiles.length > 0 && (
        <section>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-neutral-textSecondary">
              Ignored files ({otherFiles.length})
            </summary>
            <ul className="mt-2 space-y-1 text-xs text-neutral-textSecondary">
              {otherFiles.map((f, i) => (
                <li key={`${f.rel_path}-${i}`} className="truncate" title={f.rel_path}>
                  {f.name} — {f.reason}
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}

export default FileReviewList;
