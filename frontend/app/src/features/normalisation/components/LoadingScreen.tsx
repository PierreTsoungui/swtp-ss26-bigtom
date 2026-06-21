/**
 * Kleine Hilfskomponente zum Anzeigen eines Ladebildschirms
 * @param message Die Nachricht, die angezeigt werden soll
 * @param isError Optionales Flag, das angibt, ob die Nachricht eine Fehlermeldung ist (Standard: false). Wenn true, wird die Nachricht in roter Farbe angezeigt.
 * @constructor
 */
function LoadingScreen({ message, isError = false }: { message: string; isError?: boolean }) {
    return (
        <main className="flex min-h-screen items-center justify-center">
            <p className={isError ? "text-danger" : "text-neutral-textSecondary"}>{message}</p>
        </main>
    );
}

export default LoadingScreen;
