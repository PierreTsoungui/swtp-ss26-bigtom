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
                className="rounded-full border-2 border-danger bg-danger px-10 py-3 font-bold text-danger-text transition-colors hover:bg-danger-hover disabled:cursor-not-allowed disabled:border-neutral-textSecondary disabled:bg-neutral-surface disabled:text-neutral-textSecondary"
            >
                Cancel
            </button>
        </div>
    );
}

export default CancelButton;
