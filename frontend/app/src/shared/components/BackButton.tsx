import {useNavigate} from "react-router";
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

/**
 * Simpler Zurück-Button, der einen Rücksprung in der Browser-History ermöglicht.
 * Er verwendet das useNavigate-Hook von react-router, um die Navigation zu steuern.
 *
 * @returns Ein Button-Element, das den Benutzer zurück zur vorherigen Seite navigiert, wenn es angeklickt wird.
 * @constructor
 */
function BackButton() {
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
