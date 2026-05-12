import { Snackbar, type SnackbarOrigin } from "@mui/material";
import type { ProblemDetail } from "../types/ErrorTypes";
import React from "react";

interface State extends SnackbarOrigin {
  open: boolean;
}

function ErrorMessage({ open, vertical, horizontal }: State, error : ProblemDetail) {

    const [state, setState] = React.useState<State>({
        open: open,
        vertical: vertical,
        horizontal: horizontal,
    });

    const handleClose = () => {
        setState({ ...state, open: false });
    };
    
    // Nach 10 Sekunden automatisch schließen    React.useEffect(() => {
    if (state.open) {
        const timer = setTimeout(() => {
            setState({ ...state, open: false });
        }, 10000);
        return () => clearTimeout(timer);
    }
    // Error titel und detail angeben
    return (
        <Snackbar
        anchorOrigin={{ vertical, horizontal }}
        open={open}
        onClose={handleClose}
        message={`${error.title}: ${error.detail}`}
        key={vertical + horizontal}
        />
    );
}

export default ErrorMessage;