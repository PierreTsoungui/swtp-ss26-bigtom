/**
 * Props für die Abbruch Button
 * @property onCancel - Funktion, die aufgerufen wird, wenn der Button geklickt wird
 * @property disabled - Optionales Flag, das angibt, ob der Button deaktiviert sein soll (Standard: false)
 */
type CancelButtonProps = {
    onCancel: () => void;
    disabled?: boolean;
}

/**
 * Komponente, die einen Button zum Abbrechen der Analyse anzeigt.
 * @param props - Props der CancelButton-Komponente
 * @constructor
 */
function CancelButton({ onCancel, disabled = false, }: CancelButtonProps) {
    return (
        <div className="flex justify-center">
            <button
                onClick={onCancel}
                disabled={disabled}
                className="bg-danger hover:bg-danger-hover text-danger-text font-bold py-3 px-10 rounded-full transition-colors"
            >
                Cancel
            </button>
        </div>
    );
}

export default CancelButton;
