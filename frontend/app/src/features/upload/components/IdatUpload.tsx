import WarningIcon from "@mui/icons-material/Warning";

/**
 * Typdefinition für die Props der IdatUpload-Komponente
 * @property idatFiles Array von IDAT-Dateien, die aktuell ausgewählt wurden.
 * @property idatErrors Array von Fehlern, die mit den ausgewählten IDAT-Dateien verbunden sind (z.B. ungültige Dateien oder fehlende Paare).
 * @property handleIdatChange Eine Funktion, die aufgerufen wird, wenn der Benutzer neue IDAT-Dateien auswählt (z.B. durch Klicken auf den Upload-Button und Auswählen von Dateien).
 */
type IdatUploadProps = {
    idatFiles: File[];
    idatErrors: string[];
    handleIdatChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Komponente für den Upload von IDAT-Dateien
 * @param params Die Props für die IdatUpload-Komponente, bestehend aus den ausgewählten IDAT-Dateien, den Fehlern und der Änderungsfunktion. 
 * @returns JSX.Element Ein Upload-Bereich für IDAT-Dateien mit Validierungsanzeige (Fehler oder Anzahl der Dateien).
 */
const IdatUpload: React.FC<IdatUploadProps> = ({ idatFiles, idatErrors, handleIdatChange }) => {
    return (
        <div className="flex flex-col gap-2">
          <label className="cursor-pointer bg-slate-400 hover:bg-slate-500
                            rounded-full p-4 px-8 text-center">
            IDAT-Dateien auswählen
            <input
              type="file"
              className="hidden"
              multiple
              accept=".idat"
              onChange={handleIdatChange}
            />
          </label>
          <p className="text-sm"><b>Erlaubte Dateien:</b> *.idat</p>
          <p className="text-sm text-slate-500">
            {idatFiles.length > 0 &&
              `${idatFiles.length} Dateien (${idatFiles.length / 2} Paare)`}
          </p>
          {idatErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-600"><WarningIcon fontSize="small" /> {err}</p>
          ))}
        </div>
    );
}

export default IdatUpload;