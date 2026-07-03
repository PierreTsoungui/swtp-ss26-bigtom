import WarningIcon from "@mui/icons-material/Warning";

/**
 * Typdefinition für die Props der IdatUpload-Komponente
 * @property idatFiles Array von IDAT-Dateien, die aktuell ausgewählt wurden.
 * @property idatErrors Array von Fehlern, die mit den ausgewählten IDAT-Dateien verbunden sind.
 * @property handleIdatChange Eine Funktion, die bei neuen IDAT-Dateien aufgerufen wird.
 */
type IdatUploadProps = {
    idatFiles: File[];
    idatErrors: string[];
    handleIdatChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Komponente für den Upload von IDAT-Dateien und IDAT-Ordnern.
 */
const IdatUpload: React.FC<IdatUploadProps> = ({ idatFiles, idatErrors, handleIdatChange }) => {
    const pairCount = Math.floor(idatFiles.length / 2);

    return (
        <div className="flex flex-col gap-2">
            <label
                htmlFor="idat-file-input"
                className="cursor-pointer rounded-full bg-secondary p-4 px-8 text-center font-semibold text-secondary-text hover:bg-secondary-hover focus-within:outline focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-primary"
            >
                IDAT-Dateien auswählen
                <input
                    id="idat-file-input"
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".idat"
                    onChange={handleIdatChange}
                />
            </label>
            <label
                htmlFor="idat-folder-input"
                className="cursor-pointer rounded-full bg-secondary p-4 px-8 text-center font-semibold text-secondary-text hover:bg-secondary-hover focus-within:outline focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-primary"
            >
                IDAT-Ordner auswählen
                <input
                    id="idat-folder-input"
                    type="file"
                    className="sr-only"
                    multiple
                    accept=".idat"
                    webkitdirectory=""
                    onChange={handleIdatChange}
                />
            </label>
            <p className="text-sm text-neutral-textPrimary"><b>Erlaubte Dateien:</b> *.idat</p>
            <p className="text-sm text-neutral-textSecondary">
                {idatFiles.length > 0 &&
                    `${idatFiles.length} Dateien (${pairCount} Paare)`}
          </p>
          {idatErrors.map((err, i) => (
            <p key={i} className="text-sm text-danger"><WarningIcon fontSize="small" /> {err}</p>
          ))}
        </div>
    );
}

export default IdatUpload;
