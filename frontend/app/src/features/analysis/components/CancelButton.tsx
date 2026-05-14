function CancelButton({ onCancel }: { onCancel: () => void }) {
    return (
        <div className="flex justify-center m-10">
            <button
                onClick={onCancel}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-10 rounded-full transition-colors"
            >
                Analyse abbrechen
            </button>
        </div>
    );
}

export default CancelButton;