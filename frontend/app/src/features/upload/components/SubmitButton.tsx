
/**
 * Diese Komponente repräsentiert den Button zum Starten der Analyse.
 * Sie ist nur aktiv, wenn die Validierung der IDAT-Dateien und des Sample Sheets erfolgreich war (d.h. keine Fehler vorliegen und beide Felder befüllt sind).
 * @param canSubmit Gibt an, ob die Analyse gestartet werden kann (basierend auf der Validierung der IDAT-Dateien und des Sample Sheets).
 * @param onClick Eine Funktion, die aufgerufen wird, wenn der Button geklickt wird. Sie sollte den Request zum Starten der Analyse auslösen.
 * @returns JSX.Element Ein Button, der den Request zum Starten der Analyse auslöst.
 */
const SubmitButton: React.FC<{ canSubmit: boolean; onClick: () => void }> =
    ({ canSubmit, onClick }) => {
        return (
            <div className="flex justify-center m-10">
                <button
                    disabled={!canSubmit}
                    onClick={onClick}
                    className="rounded-full border-2 border-primary bg-primary px-10 py-3 font-bold text-primary-text transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:border-neutral-textSecondary disabled:bg-neutral-surface disabled:text-neutral-textSecondary disabled:hover:bg-neutral-surface"
                >
                    Start Analysis
                </button>
            </div>
        );
    }

export default SubmitButton;
