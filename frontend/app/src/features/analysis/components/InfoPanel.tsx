import { useId } from "react";

/**
 * Props for the {@link InfoPanel}.
 */
interface InfoPanelProps {
  /** Heading of the information block. */
  title: string;
  /** Descriptive message or status details. */
  message: string;
}

/**
 * A container for a status update, placeholder, or informational message.
 *
 * Used within page layouts to inform the user about an ongoing process or a
 * missing-data state. The heading is associated with the region via a unique
 * generated id, so multiple panels never share an `id`.
 *
 * @param props - See {@link InfoPanelProps}.
 */
function InfoPanel({ title, message }: InfoPanelProps) {
  const titleId = useId();

  return (
    <section
      className="w-full max-w-2xl rounded-lg border border-neutral-borderDefault bg-neutral-card p-6 shadow-sm"
      aria-labelledby={titleId}
    >
      <h1 id={titleId} className="text-2xl font-semibold text-neutral-textPrimary">
        {title}
      </h1>

      <p className="mt-3 text-neutral-textSecondary">{message}</p>
    </section>
  );
}

export default InfoPanel;
