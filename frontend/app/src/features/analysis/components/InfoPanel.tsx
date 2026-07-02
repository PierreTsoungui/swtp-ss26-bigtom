/**
 * Props for the InfoPanel component.
 */
interface InfoPanelProps {
    /** Heading of the information block. */
    title: string;
    /** Descriptive message or status details. */
    message: string;
}

/**
 * A reusable container for displaying status updates, placeholders, or informational messages.
 *
 * Commonly used within page layouts to inform the user about ongoing processes
 * or missing data states
 */
function InfoPanel({ title, message }: InfoPanelProps) {
    return (
        <section
            className="w-full max-w-2xl rounded-lg border border-neutral-borderDefault bg-neutral-card p-6 shadow-sm"
            aria-labelledby="analysis-title"
        >
            <h1
                id="analysis-title"
                className="text-2xl font-semibold text-neutral-textPrimary"
            >
                {title}
            </h1>

            <p className="mt-3 text-neutral-textSecondary">
                {message}
            </p>
        </section>
    );
}

export default InfoPanel;
