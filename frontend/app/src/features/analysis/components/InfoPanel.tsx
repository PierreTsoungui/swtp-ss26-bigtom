/**
 * Props für die InfoPanel-Komponente
 * @property title - Titel der Information,
 * @property message - Detaillierte Nachricht oder Beschreibung der Information
 */
interface InfoPanelProps {
    title: string;
    message: string;
}

/**
 * Hilfskomponente zum Anzeigen von Informationen
 * Wird in der AnalysisPage verwendet, um den Nutzer über den aktuellen Status der Analyse zu informieren, z.B. wenn die Analyse abgeschlossen ist oder wenn ein Fehler aufgetreten ist.
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
