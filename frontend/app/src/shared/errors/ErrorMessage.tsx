import { Alert, Snackbar, type SnackbarOrigin } from "@mui/material";
import type { ProblemDetail } from "./ErrorTypes";

/**
 * Props for the ErrorMessage component.
 */
interface ErrorMessageProps extends SnackbarOrigin {
  /** Indicates whether the error message should be displayed. */
  open: boolean;
  /** The error object, string, or detail to be displayed. */
  error: ProblemDetail | Error | string | null;
  /** Callback function fired when the component requests to be closed. */
  onClose: () => void;
}

/**
 * A component that displays error messages using a Material-UI Snackbar and Alert.
 *
 * Automatically parses different error formats (ProblemDetail, Error object, or string)
 * to ensure a consistent user experience.
 */
function ErrorMessage({ open, vertical, horizontal, error, onClose }: ErrorMessageProps) {
  const message = (() => {
    if (!error) {
      return "Unknown error";
    }

    if (typeof error === "string") {
      return error;
    }

    if (typeof error === "object" && "title" in error && "detail" in error) {
      // Narrowed to ProblemDetail by the `in` checks above.
      return `${error.title}: ${error.detail}`;
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
      onClose={(_event, reason) => {
        if (reason === "clickaway") {
          return;
        }
        onClose();
      }}
      sx={{
        width: "100%",
        maxWidth: "600px",
        p: 2,
        alignItems: "center",
      }}
    >
      <Alert
        severity="error"
        onClose={onClose}
        sx={{
          fontSize: "1.25rem",
          width: "100%",
          alignItems: "center",
          "& .MuiAlert-icon, & .MuiAlert-action": {
            fontSize: "1.5rem",
          },
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}

export default ErrorMessage;
