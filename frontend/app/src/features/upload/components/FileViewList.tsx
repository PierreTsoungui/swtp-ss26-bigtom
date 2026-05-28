import Chip from "@mui/material/Chip";
import { getFileDisplayName, getFileIdentity } from "../utils/fileIdentity";

/**
 * Typdefinition für die Props der FileViewList-Komponente
 * @property files Array von Dateien, die angezeigt werden sollen.
 * @property errors Array von Fehlern, die mit den Dateien verbunden sind (z.B. Validierungsfehler).
 * @property onRemove Funktion, die aufgerufen wird, wenn eine Datei entfernt werden soll (z.B. durch Klicken auf das "X" im Chip).
 */
type FileViewListProps = {
    files: File[];
    errors: string[];
    onRemove: (file: File) => void;
}

/**
 * Komponente zur Anzeige der hochgeladenen IDAT-Dateien als Chips
 * @param params Die Props für die FileViewList-Komponente, bestehend aus den Dateien, Fehlern und der Entfernen-Funktion.
 * @returns JSX.Element Eine Liste von Chips, die die hochgeladenen IDAT-Dateien repräsentieren.
 */
const FileViewList: React.FC<FileViewListProps> = ({ files, errors, onRemove }) => {
    return (
        <div className="m-10">
        <h2 className="text-2xl font-bold m-5">
            IDAT-Dateien ({files.length})
        </h2>
        <div className="flex flex-wrap gap-2">
            {files.map((file) => (
            <Chip
                key={getFileIdentity(file)}
                label={getFileDisplayName(file)}
                onDelete={() => onRemove(file)}
                color={errors.length > 0 ? "error" : "primary"}
                variant="outlined"
                size="small"
            />
            ))}
        </div>
        </div>
    );
}

export default FileViewList;