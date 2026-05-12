function CancelButton({ onCancel }: { onCancel: () => void }) {
    // TODO: onCancel Funktion implementieren, die den Request zum Abbrechen der Analyse an die API sendet. Wahrscheinlich muss hier die job_id mitgegeben werden, damit die API weiß, welche Analyse abgebrochen werden soll.
    // Route müsste POST /reset/{job_id} sein

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