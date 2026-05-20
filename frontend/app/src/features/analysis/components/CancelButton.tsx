
type CancelButtonProps = {
    onCancel: () => void;
    disabled?: boolean;
}

function CancelButton({ onCancel, disabled = false, }: CancelButtonProps) {
    return (
        <div className="flex justify-center m-10">
            <button
                onClick={onCancel}
                disabled={disabled}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-10 rounded-full transition-colors"
            >
                Analyse abbrechen
            </button>
        </div>
    );
}

export default CancelButton;