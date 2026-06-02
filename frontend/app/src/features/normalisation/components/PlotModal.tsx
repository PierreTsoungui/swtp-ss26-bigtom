/**
 * Props für die Modalansicht beim Anklicken der Props
 * @property imageURL - URL des Bildes, das im Modal angezeigt werden soll
 * @property title - Titel oder Beschreibung des Bildes, das im Modal angezeigt wird
 * @property onClose - Funktion, die aufgerufen wird, wenn das Modal geschlossen werden soll (z.B. durch Klicken außerhalb des Modals oder auf den Schließen-Button)
 *
 */
interface PlotModalProps {
    imageURL: string;
    title: string;
    onClose: () => void;
}

/**
 * Komponente, die ein Modal anzeigt, wenn auf ein Plot geklickt wird. Das Modal zeigt das Bild in voller Größe und einen Titel an.
 * @param imageURL - URL des Bildes, das im Modal angezeigt werden soll
 * @param title - Titel oder Beschreibung des Bildes, das im Modal angezeigt wird
 * @param onClose - Funktion, die aufgerufen wird, wenn das Modal geschlossen werden soll (z.B. durch Klicken außerhalb des Modals oder auf den Schließen-Button)
 * @constructor
 */
function PlotModal({imageURL, title, onClose}: PlotModalProps) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative max-h-[90vh] max-w-[90vw] bg-white rounded-xl shadow-2xl p-4"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onClose}
                    className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white shadow-md hover:bg-slate-100 flex items-center justify-center text-lg font-bold"
                >
                    ✕
                </button>
                <img
                    src={imageURL}
                    alt={title}
                    className="max-h-[85vh] w-auto rounded-md"
                />
                <p className="mt-2 text-center text-sm text-slate-600">{title}</p>
            </div>
        </div>
    );
}

export default PlotModal;