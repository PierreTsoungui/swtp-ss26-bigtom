/**
 * Small inline spinner shown while the server inspects or commits an upload.
 * (A real progress bar is reserved for the R pipeline; here we only signal that
 * something is happening.)
 */
function UploadSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 p-4 text-neutral-textSecondary">
      <span
        aria-hidden
        className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-neutral-borderEmphasis border-t-primary"
      />
      <span>{label}</span>
    </div>
  );
}

export default UploadSpinner;
