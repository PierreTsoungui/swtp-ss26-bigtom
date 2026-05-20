import { Snackbar, type SnackbarOrigin } from "@mui/material";
import type { ProblemDetail } from "../types/ErrorTypes";
import {useEffect, useState} from "react";

interface ErrorMessageProps extends SnackbarOrigin {
  open: boolean;
  error: ProblemDetail;
}

function ErrorMessage({ open, vertical, horizontal, error }: ErrorMessageProps) {
    const [isOpen, setisOpen] = useState(open);

    useEffect(() => {
        setisOpen(open);
    }, [open, error]);

    // Nach 10 Sekunden automatisch schließen
    useEffect(() => {
        if (isOpen) {
            const timer = setTimeout(() => {
                setisOpen(false);
            }, 10000);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleClose = () => {
        setisOpen(false)
    };

    return (
        <Snackbar
        anchorOrigin={{ vertical, horizontal }}
        open={isOpen}
        onClose={handleClose}
        message={`${error.title}: ${error.detail}`}
        key={vertical + horizontal}
        />
    );
}

export default ErrorMessage;