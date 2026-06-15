import { useState } from "react";

/**
 * Props für die HelpButton-Komponente
 * @property helpText - Text, der im Hilfe-Modal angezeigt wird (konfigurierbar)
 */
interface HelpButtonProps {
    helpText?: string;
}

/**
 * Wiederverwendbare Komponente für einen kleinen Hilfe-Button.
 * Beim Anklicken öffnet sich ein modales Fenster, das konfigurierbare Hilfetexte anzeigen kann.
 * Diese Komponente enthält keine fachliche Logik und kann flexibel in beliebige Seiten integriert werden.
 */
function HelpButton({ helpText = "Hilfetext folgt später..." }: HelpButtonProps) {
    const [open, setOpen] = useState(false);

    return (
        <>
            {/* Kleiner quadratischer Button mit "?" */}
            <button
                onClick={() => setOpen(true)}
                className="flex items-center justify-center w-6 h-6 rounded-md border border-slate-300 bg-slate-100 text-slate-700 font-bold hover:bg-slate-200"
                aria-label="Hilfe öffnen"
            >
                ?
            </button>

            {/* Modal */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
                    onClick={() => setOpen(false)}
                    aria-modal="true"
                    role="dialog"
                >
                    <div
                        className="bg-white p-6 rounded-lg shadow-lg min-w-[260px] max-w-sm"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-semibold text-slate-900 mb-3">
                            Hilfe
                        </h2>

                        <p className="text-slate-700 mb-4">
                            {helpText}
                        </p>

                        <button
                            onClick={() => setOpen(false)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                            Schließen
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}

export default HelpButton;
