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
    let navigate = useNavigate();
    return (
        <button
            className="flex items-center gap-1 text-gray-600 hover:text-gray-800 transition-colors"
            onClick={() => navigate(-1)}
        >
                <ArrowBackIcon /> Back
        </button>
    );
}
export default BackButton;