import { useRef, useState } from "react";

/**
 * Props for the UploadDropzone component.
 */
interface UploadDropzoneProps {
  /** Callback triggered when valid files or folders are selected. */
  onFiles: (files: File[]) => void;
  /** Whether the dropzone is non-interactive. */
  disabled?: boolean;
  /**
   * If true, uses a minimal UI layout.
   * Typically used as an "Add more" button during the review phase.
   */
  compact?: boolean;
}

/** Accepted file extensions for direct selection. */
const ACCEPTED = [".zip", ".idat", ".csv", ".xls", ".xlsx"];
const ACCEPT_ATTR = ACCEPTED.join(",");

/** Checks if a file extension is in the allowed list. */
function isAccepted(file: File): boolean {
  const lower = file.name.toLowerCase();
  return ACCEPTED.some((ext) => lower.endsWith(ext));
}

/**
 * A multi-mode upload component supporting drag-and-drop, file picking, and folder selection.
 *
 * Flow logic:
 * - **Files/ZIPs**: Filtered client-side against {@link ACCEPTED} extensions.
 * - **Folders**: Passed through entirely; the backend handles recursive filtering.
 */
function UploadDropzone({ onFiles, disabled = false, compact = false }: UploadDropzoneProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rejected, setRejected] = useState(0);

  /** Filters a file list and emits only accepted files. */
  const emitDirect = (list: FileList | null) => {
    const all = Array.from(list ?? []);
    const accepted = all.filter(isAccepted);
    setRejected(all.length - accepted.length);
    if (accepted.length > 0) onFiles(accepted);
  };

  /** Emits all files from a folder selection without client-side filtering. */
  const emitFolder = (list: FileList | null) => {
    setRejected(0);
    const files = Array.from(list ?? []);
    if (files.length > 0) onFiles(files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (!disabled) emitDirect(e.dataTransfer.files);
      }}
      className={`rounded-xl border-2 border-dashed text-center transition-colors ${
        compact ? "p-4" : "p-10"
      } ${
        disabled
          ? "cursor-not-allowed border-neutral-borderDefault bg-neutral-surface opacity-60"
          : dragOver
            ? "border-primary bg-info-badgeBackground"
            : "border-neutral-borderEmphasis bg-neutral-card hover:border-primary"
      }`}
    >
      {!compact && (
        <p className="mb-1 text-lg font-semibold text-neutral-textPrimary">
          Drop a folder, a .zip or individual files here
        </p>
      )}
      <p className="mb-4 text-sm text-neutral-textSecondary">
        {compact
          ? "Add more files (folder, ZIP, IDAT, CSV, XLSX)"
          : "Accepted: folder, ZIP, IDAT, CSV, XLSX — files are detected automatically."}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileInput.current?.click()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-text hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          Select files / ZIP
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => folderInput.current?.click()}
          className="rounded-lg border-2 border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-text disabled:cursor-not-allowed disabled:opacity-60"
        >
          Select folder
        </button>
      </div>

      {rejected > 0 && (
        <p className="mt-3 text-xs text-warning-badgeText">
          {rejected} file{rejected === 1 ? "" : "s"} ignored — only folder, ZIP, IDAT, CSV and XLSX are allowed.
        </p>
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={ACCEPT_ATTR}
        onChange={(e) => {
          emitDirect(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={folderInput}
        type="file"
        hidden
        // Folder selection: non-standard but widely supported attributes.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          emitFolder(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default UploadDropzone;
