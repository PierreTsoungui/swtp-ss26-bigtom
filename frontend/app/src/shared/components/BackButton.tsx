import {useNavigate} from "react-router";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import type {JSX} from "react";

/**
 * A simple back button component that allows the user to go back to the previous page.
 * It utilizes the `useNavigate` hook from react-router-dom to access the browser's history stack.
 */
function BackButton(): JSX.Element {
    let navigate = useNavigate();
    return (
        <button
            className="flex items-center gap-1 text-neutral-textSecondary hover:text-neutral-textPrimary transition-colors"
            onClick={() => navigate(-1)}
        >
                <ArrowBackIcon /> Back
        </button>
    );
}
export default BackButton;
