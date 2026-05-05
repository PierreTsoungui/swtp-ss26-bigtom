
/**
 * Diese Komponente repräsentiert den Button zum Starten der Analyse.
 * Sie ist nur aktiv, wenn die Validierung der IDAT-Dateien und des Sample Sheets erfolgreich war (d.h. keine Fehler vorliegen und beide Felder befüllt sind).
 * @param canSubmit Gibt an, ob die Analyse gestartet werden kann (basierend auf der Validierung der IDAT-Dateien und des Sample Sheets).
 * @returns JSX.Element Ein Button, der den Request zum Starten der Analyse auslöst.
 */
const SubmitButton: React.FC<{ canSubmit: boolean; onClick: () => void }> =
    ({ canSubmit, onClick }) => {
        return (
            <div className="flex justify-center m-10">
                <button
                    disabled={!canSubmit}
                    onClick={onClick}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300
                           disabled:cursor-not-allowed text-white font-bold
                           py-3 px-10 rounded-full transition-colors"
                >
                    Analyse starten
                </button>
            </div>
        );
    }

export default SubmitButton;