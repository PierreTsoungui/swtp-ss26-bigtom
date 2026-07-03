import CheckIcon from "@mui/icons-material/Check";
import WarningIcon from "@mui/icons-material/Warning";

/**
 * Typdefinition für die Props der SampleSheetUpload-Komponente
 * @property sampleSheet Die aktuell ausgewählte Sample Sheet Datei (oder null, wenn keine ausgewählt ist).
 * @property sampleSheetError Ein Fehlerstring, der angezeigt wird, wenn die Validierung des Sample Sheets fehlschlägt.
 * @property onSampleSheetChange Eine Funktion, die aufgerufen wird, wenn der Benutzer eine neue Datei für das Sample Sheet auswählt.
 */
type SampleSheetUploadProps = {
    sampleSheet: File | null;
    sampleSheetError: string;
    onSampleSheetChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

/**
 * Komponente für den Upload eines Sample Sheets (CSV oder XLSX)
 * @param params Die Props für die SampleSheetUpload-Komponente
 * @returns JSX.Element Ein Upload-Bereich für das Sample Sheet mit Validierungsanzeige (Fehler oder Erfolg).
 */
const SampleSheetUpload: React.FC<SampleSheetUploadProps> = ({ sampleSheet, sampleSheetError, onSampleSheetChange }) => {
    return (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="sample-sheet-input"
            className="cursor-pointer rounded-full bg-secondary p-4 px-8 text-center font-semibold text-secondary-text hover:bg-secondary-hover focus-within:outline focus-within:outline-3 focus-within:outline-offset-3 focus-within:outline-primary"
          >
            Sample Sheet auswählen
            <input
              id="sample-sheet-input"
              type="file"
              className="sr-only"
              accept=".csv,.xlsx"
              onChange={onSampleSheetChange}
            />
          </label>

          <p className="text-sm text-neutral-textPrimary"><b>Erlaubte Dateien:</b> *.csv, *.xlsx</p>
          {sampleSheet && (
            <p className="text-sm text-success"><CheckIcon fontSize="small" /> {sampleSheet.name}</p>
          )}
          {sampleSheetError && (
            <p className="text-sm text-danger"><WarningIcon fontSize="small" /> {sampleSheetError}</p>
          )}
        </div>
    );
}

export default SampleSheetUpload;
