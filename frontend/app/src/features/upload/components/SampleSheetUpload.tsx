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
          <label className="cursor-pointer bg-slate-400 hover:bg-slate-500 rounded-full p-4 px-8 text-center">
            Sample Sheet auswählen
            <input
              type="file"
              className="hidden"
              accept=".csv,.xlsx"
              onChange={onSampleSheetChange}
            />
          </label>

          <p className="text-sm"><b>Erlaubte Dateien:</b> *.csv, *.xlsx</p>
          {sampleSheet && (
            <p className="text-sm text-green-600"><CheckIcon fontSize="small" /> {sampleSheet.name}</p>
          )}
          {sampleSheetError && (
            <p className="text-sm text-red-600"><WarningIcon fontSize="small" /> {sampleSheetError}</p>
          )}
        </div>
    );
}

export default SampleSheetUpload;