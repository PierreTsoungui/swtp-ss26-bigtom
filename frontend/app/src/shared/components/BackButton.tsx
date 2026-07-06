import { useNavigate } from "react-router";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import type { JSX } from "react";

/**
 * A simple back button component that allows the user to go back to the previous page.
 * It utilizes the `useNavigate` hook from react-router to access the browser's history stack.
 */
function BackButton(): JSX.Element {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-md text-neutral-textSecondary transition-colors hover:text-neutral-textPrimary"
      onClick={() => {
        void navigate(-1);
      }}
    >
      <ArrowBackIcon /> Back
    </button>
  );
}
export default BackButton;
