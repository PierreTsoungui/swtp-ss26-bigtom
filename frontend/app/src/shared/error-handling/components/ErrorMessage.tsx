import { Snackbar, type SnackbarOrigin } from "@mui/material";
import type { ProblemDetail } from "../types/ErrorTypes";

/**
 * Props, die an die ErrorMessage-Komponente übergeben werden
 * @property {boolean} open - Gibt an, ob die Fehlermeldung angezeigt werden soll.
 * @property {ProblemDetail} error - Das Fehlerobjekt, das die Details der Fehlermeldung enthält.
 * @property {SnackbarOrigin} SnackbarOrigin - Die Position, an der die Snackbar angezeigt werden soll (vertikal und horizontal).
 */
interface ErrorMessageProps extends SnackbarOrigin {
  open: boolean;
  error: ProblemDetail | Error | string | null;
}

/**
 * Komponente, die eine Fehlermeldung in Form einer Snackbar anzeigt.
 * Sie verwendet die Material-UI Snackbar-Komponente, um die Fehlermeldung anzuzeigen.
 * @property open - Gibt an, ob die Fehlermeldung angezeigt werden soll.
 * @property error - Das Fehlerobjekt, das die Details der Fehlermeldung enthält.
 * @property vertical - Die vertikale Position der Snackbar (top oder bottom).
 * @property horizontal - Die horizontale Position der Snackbar (left, center oder right).
 * @returns Die gerenderte ErrorMessage-Komponente
 */
function ErrorMessage({ open, vertical, horizontal, error }: ErrorMessageProps) {
    const message = (() => {

        if (!error) {
            return "Unknown error";
        }

        if (
            typeof error === "object" && "title" in error &&
            "detail" in error
        ) {
            const e = error as ProblemDetail;
            return `${e.title}: ${e.detail}`;
        }

        if (error instanceof Error) {
            return error.message;
        }

        return "Unexpected error occurred";
    })();

    return (
        <Snackbar
        anchorOrigin={{ vertical, horizontal }}
        open={open}
        autoHideDuration={10000}
        message={message}
        />
    );
}

export default ErrorMessage;